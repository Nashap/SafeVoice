package com.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ProtectionServiceModule.NAME)
class ProtectionServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ProtectionServiceModule"
        private const val TAG = "ProtectionServiceModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun startProtectionService(title: String?, message: String?, promise: Promise) {
        Log.i(TAG, "[PROTECTION_MODULE] startProtectionService requested")

        // 1. Check microphone permission
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "[PROTECTION_MODULE] RECORD_AUDIO permission not granted")
            promise.reject("ERR_PERMISSION_DENIED", "Microphone permission (RECORD_AUDIO) is required to start Protection Mode.")
            return
        }

        // 2. Prevent duplicate services if already running
        if (ProtectionModeService.isRunning) {
            Log.i(TAG, "[PROTECTION_MODULE] Service already running. Resolving true.")
            if (title != null || message != null) {
                updateProtectionServiceStatus(title ?: "", message ?: "", null)
            }
            promise.resolve(true)
            return
        }

        try {
            val intent = Intent(reactContext, ProtectionModeService::class.java).apply {
                action = ProtectionModeService.ACTION_START
                if (title != null) putExtra(ProtectionModeService.EXTRA_TITLE, title)
                if (message != null) putExtra(ProtectionModeService.EXTRA_MESSAGE, message)
            }
            ContextCompat.startForegroundService(reactContext, intent)
            Log.i(TAG, "[PROTECTION_MODULE] startForegroundService dispatched")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "[PROTECTION_MODULE] Exception starting service: ${e.message}", e)
            promise.reject("ERR_START_SERVICE", e.message)
        }
    }

    @ReactMethod
    fun stopProtectionService(promise: Promise) {
        Log.i(TAG, "[PROTECTION_MODULE] stopProtectionService requested")
        if (!ProtectionModeService.isRunning) {
            Log.i(TAG, "[PROTECTION_MODULE] Service not running. Resolving true.")
            promise.resolve(true)
            return
        }

        try {
            val intent = Intent(reactContext, ProtectionModeService::class.java).apply {
                action = ProtectionModeService.ACTION_STOP
            }
            reactContext.startService(intent)
            Log.i(TAG, "[PROTECTION_MODULE] stopService dispatched")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "[PROTECTION_MODULE] Exception stopping service: ${e.message}", e)
            promise.reject("ERR_STOP_SERVICE", e.message)
        }
    }

    @ReactMethod
    fun isProtectionServiceRunning(promise: Promise) {
        val running = ProtectionModeService.isRunning
        promise.resolve(running)
    }

    @ReactMethod
    fun getProtectionStatus(promise: Promise) {
        val map = Arguments.createMap().apply {
            putBoolean("serviceRunning", ProtectionModeService.isRunning)
            putBoolean("micRecording", com.vosk.CustomSpeechService.activeInstance?.isRunning() ?: false)
            putInt("countdownSeconds", ProtectionModeService.currentCountdown)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun updateProtectionServiceStatus(title: String, message: String, promise: Promise? = null) {
        if (!ProtectionModeService.isRunning) {
            promise?.resolve(false)
            return
        }

        try {
            val intent = Intent(reactContext, ProtectionModeService::class.java).apply {
                action = ProtectionModeService.ACTION_UPDATE_STATUS
                putExtra(ProtectionModeService.EXTRA_TITLE, title)
                putExtra(ProtectionModeService.EXTRA_MESSAGE, message)
            }
            reactContext.startService(intent)
            promise?.resolve(true)
        } catch (e: Exception) {
            Log.w(TAG, "[PROTECTION_MODULE] Exception updating status: ${e.message}")
            promise?.reject("ERR_UPDATE_STATUS", e.message)
        }
    }

    @ReactMethod
    fun startEmergencyCountdown(seconds: Double, promise: Promise) {
        if (!ProtectionModeService.isRunning) {
            promise.resolve(false)
            return
        }

        try {
            val intent = Intent(reactContext, ProtectionModeService::class.java).apply {
                action = ProtectionModeService.ACTION_START_COUNTDOWN
                putExtra(ProtectionModeService.EXTRA_SECONDS, seconds.toInt())
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "[PROTECTION_MODULE] Exception starting countdown: ${e.message}", e)
            promise.reject("ERR_START_COUNTDOWN", e.message)
        }
    }

    @ReactMethod
    fun cancelEmergencyCountdown(promise: Promise) {
        if (!ProtectionModeService.isRunning) {
            promise.resolve(false)
            return
        }

        try {
            val intent = Intent(reactContext, ProtectionModeService::class.java).apply {
                action = ProtectionModeService.ACTION_CANCEL_COUNTDOWN
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "[PROTECTION_MODULE] Exception cancelling countdown: ${e.message}", e)
            promise.reject("ERR_CANCEL_COUNTDOWN", e.message)
        }
    }
}
