package com.mobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vosk.CustomSpeechService

class ProtectionModeService : Service() {

    companion object {
        private const val TAG = "ProtectionModeService"
        const val CHANNEL_ID = "safevoice_protection_channel"
        const val CHANNEL_NAME = "SafeVoice Protection"
        const val NOTIFICATION_ID = 9001

        const val ACTION_START = "com.mobile.action.START_PROTECTION"
        const val ACTION_STOP = "com.mobile.action.STOP_PROTECTION"
        const val ACTION_UPDATE_STATUS = "com.mobile.action.UPDATE_STATUS"
        const val ACTION_SIMULATE_TRIGGER = "com.mobile.action.SIMULATE_TRIGGER"
        const val ACTION_START_COUNTDOWN = "com.mobile.action.START_COUNTDOWN"
        const val ACTION_CANCEL_COUNTDOWN = "com.mobile.action.CANCEL_COUNTDOWN"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_MESSAGE = "extra_message"
        const val EXTRA_PHRASE = "extra_phrase"
        const val EXTRA_SECONDS = "extra_seconds"

        @Volatile
        var isRunning: Boolean = false
            private set
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private val countdownHandler = Handler(Looper.getMainLooper())
    private var countdownRunnable: Runnable? = null
    @Volatile private var remainingCountdown: Int = 0

    private val triggerReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val phrase = intent?.getStringExtra(EXTRA_PHRASE) ?: "help me"
            Log.i(TAG, "[FOREGROUND_SERVICE] Broadcast received for phrase: $phrase")
            simulateBackgroundTrigger(phrase)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "[FOREGROUND_SERVICE] ProtectionModeService onCreate")
        createNotificationChannel()

        val filter = android.content.IntentFilter(ACTION_SIMULATE_TRIGGER)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(triggerReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(triggerReceiver, filter)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        Log.i(TAG, "[FOREGROUND_SERVICE] onStartCommand action: $action")

        when (action) {
            ACTION_STOP -> {
                stopForegroundService()
                return START_NOT_STICKY
            }
            ACTION_UPDATE_STATUS -> {
                val title = intent?.getStringExtra(EXTRA_TITLE) ?: "SafeVoice Protection Active"
                val message = intent?.getStringExtra(EXTRA_MESSAGE) ?: "Listening for emergency triggers..."
                updateNotification(title, message)
                return START_STICKY
            }
            ACTION_START_COUNTDOWN -> {
                val sec = intent?.getIntExtra(EXTRA_SECONDS, 10) ?: 10
                startCountdown(sec)
                return START_STICKY
            }
            ACTION_CANCEL_COUNTDOWN -> {
                cancelCountdown()
                return START_STICKY
            }
            ACTION_SIMULATE_TRIGGER -> {
                val phrase = intent?.getStringExtra(EXTRA_PHRASE) ?: "help me"
                Log.i(TAG, "[FOREGROUND_SERVICE] ACTION_SIMULATE_TRIGGER received with phrase: $phrase")
                simulateBackgroundTrigger(phrase)
                return START_STICKY
            }
            ACTION_START -> {
                val title = intent?.getStringExtra(EXTRA_TITLE) ?: "SafeVoice Protection Active"
                val message = intent?.getStringExtra(EXTRA_MESSAGE) ?: "Listening for emergency triggers..."
                startForegroundService(title, message)
                return START_STICKY
            }
            else -> return START_STICKY
        }
    }

    private fun startCountdown(seconds: Int) {
        countdownRunnable?.let { countdownHandler.removeCallbacks(it) }
        remainingCountdown = seconds
        Log.i(TAG, "[FOREGROUND_SERVICE] Starting emergency countdown with $seconds seconds")

        updateNotification(
            "⚠️ Potential Emergency Detected!",
            "Emergency SOS will dispatch in ${remainingCountdown}s. Tap to cancel."
        )
        sendEventToReactNative("onCountdownTick", remainingCountdown.toString())

        countdownRunnable = object : Runnable {
            override fun run() {
                remainingCountdown--
                if (remainingCountdown > 0) {
                    updateNotification(
                        "⚠️ Potential Emergency Detected!",
                        "Emergency SOS will dispatch in ${remainingCountdown}s. Tap to cancel."
                    )
                    sendEventToReactNative("onCountdownTick", remainingCountdown.toString())
                    countdownHandler.postDelayed(this, 1000L)
                } else {
                    remainingCountdown = 0
                    Log.i(TAG, "[FOREGROUND_SERVICE] Emergency countdown finished! Emitting onCountdownFinished")
                    updateNotification(
                        "🚨 Emergency SOS Dispatched",
                        "Location and emergency alert sent to emergency contacts."
                    )
                    sendEventToReactNative("onCountdownFinished", "0")
                }
            }
        }
        countdownHandler.postDelayed(countdownRunnable!!, 1000L)
    }

    private fun cancelCountdown() {
        Log.i(TAG, "[FOREGROUND_SERVICE] Cancelling emergency countdown")
        countdownRunnable?.let { countdownHandler.removeCallbacks(it) }
        countdownRunnable = null
        remainingCountdown = 0
        updateNotification(
            "SafeVoice Protection Active",
            "Listening for emergency triggers..."
        )
        sendEventToReactNative("onCountdownCancelled", "cancelled")
    }

    private fun startForegroundService(title: String, message: String) {
        if (isRunning) {
            Log.i(TAG, "[FOREGROUND_SERVICE] Already running. Updating notification.")
            updateNotification(title, message)
            return
        }

        // Verify RECORD_AUDIO permission before starting foreground service with type microphone
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "[FOREGROUND_SERVICE] Cannot start: RECORD_AUDIO permission not granted")
            sendEventToReactNative("onProtectionServiceError", "RECORD_AUDIO permission not granted")
            stopSelf()
            return
        }

        try {
            val notification = buildNotification(title, message)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }

            acquireWakeLock()
            isRunning = true
            Log.i(TAG, "[FOREGROUND_SERVICE] Successfully started foreground service with microphone type")
            sendEventToReactNative("onProtectionServiceStarted", "active")
        } catch (e: Exception) {
            Log.e(TAG, "[FOREGROUND_SERVICE] Exception in startForeground: ${e.message}", e)
            sendEventToReactNative("onProtectionServiceError", e.message ?: "Failed to start foreground service")
            stopSelf()
        }
    }

    private fun stopForegroundService() {
        Log.i(TAG, "[FOREGROUND_SERVICE] Stopping ProtectionModeService")
        isRunning = false
        countdownRunnable?.let { countdownHandler.removeCallbacks(it) }
        countdownRunnable = null
        remainingCountdown = 0
        releaseWakeLock()

        // Safely stop Vosk microphone stream if still active
        try {
            CustomSpeechService.activeInstance?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "[FOREGROUND_SERVICE] Exception stopping CustomSpeechService: ${e.message}")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
        sendEventToReactNative("onProtectionServiceStopped", "stopped")
    }

    private fun buildNotification(title: String, message: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val stopIntent = Intent(this, ProtectionModeService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setOngoing(true)
            .setPriority(if (remainingCountdown > 0) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)

        if (remainingCountdown > 0) {
            val cancelIntent = Intent(this, ProtectionModeService::class.java).apply {
                action = ACTION_CANCEL_COUNTDOWN
            }
            val cancelPendingIntent = PendingIntent.getService(
                this,
                2,
                cancelIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            )
            builder.addAction(0, "Cancel Emergency", cancelPendingIntent)
        } else {
            builder.addAction(0, "Stop Protection", stopPendingIntent)
        }

        return builder.build()
    }

    private fun updateNotification(title: String, message: String) {
        if (!isRunning) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(NOTIFICATION_ID, buildNotification(title, message))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "SafeVoice emergency voice monitoring notification"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SafeVoice:ProtectionWakeLock")
        }
        try {
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire(4 * 60 * 60 * 1000L) // 4 hours timeout max
                Log.i(TAG, "[FOREGROUND_SERVICE] Partial wake lock acquired")
            }
        } catch (e: Exception) {
            Log.w(TAG, "[FOREGROUND_SERVICE] Could not acquire wake lock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.i(TAG, "[FOREGROUND_SERVICE] Partial wake lock released")
            }
        } catch (e: Exception) {
            Log.w(TAG, "[FOREGROUND_SERVICE] Could not release wake lock: ${e.message}")
        }
    }

    private fun sendEventToReactNative(eventName: String, data: String) {
        try {
            val app = applicationContext as? ReactApplication
            val reactHost = app?.reactHost
            val currentContext = reactHost?.currentReactContext
            if (currentContext != null && currentContext.hasActiveReactInstance()) {
                currentContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, data)
            }
        } catch (e: Exception) {
            Log.w(TAG, "[FOREGROUND_SERVICE] Could not send event to RN: ${e.message}")
        }
    }

    private fun simulateBackgroundTrigger(phrase: String) {
        try {
            val payload = org.json.JSONObject().apply {
                put("text", phrase)
            }.toString()
            sendEventToReactNative("onResult", payload)
            sendEventToReactNative("onFinalResult", payload)
            Log.i(TAG, "[FOREGROUND_SERVICE] Emitted simulated background utterance to React Native: $payload")
        } catch (e: Exception) {
            Log.e(TAG, "[FOREGROUND_SERVICE] Error in simulateBackgroundTrigger: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "[FOREGROUND_SERVICE] ProtectionModeService onDestroy")
        try {
            unregisterReceiver(triggerReceiver)
        } catch (e: Exception) {}
        stopForegroundService()
    }
}
