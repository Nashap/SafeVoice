package com.mobile

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

@ReactModule(name = AudioPlayerModule.NAME)
class AudioPlayerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var mediaPlayer: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var progressRunnable: Runnable? = null
    private var currentUrl: String? = null
    private var isPrepared = false

    companion object {
        const val NAME = "AudioPlayerModule"
        private const val TAG = "AudioPlayerModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private fun emitStatus(status: String, position: Int = 0, duration: Int = 0, error: String? = null) {
        val map = Arguments.createMap().apply {
            putString("status", status)
            putInt("position", position)
            putInt("duration", duration)
            if (error != null) {
                putString("error", error)
            }
        }
        sendEvent("onAudioPlaybackStatus", map)
    }

    private fun startProgressUpdates() {
        stopProgressUpdates()
        progressRunnable = object : Runnable {
            override fun run() {
                val player = mediaPlayer
                if (player != null && isPrepared && player.isPlaying) {
                    val pos = try { player.currentPosition } catch (e: Exception) { 0 }
                    val dur = try { player.duration } catch (e: Exception) { 0 }
                    emitStatus("playing", pos, dur)
                    handler.postDelayed(this, 300)
                }
            }
        }
        handler.post(progressRunnable!!)
    }

    private fun stopProgressUpdates() {
        progressRunnable?.let {
            handler.removeCallbacks(it)
            progressRunnable = null
        }
    }

    private fun releasePlayer() {
        stopProgressUpdates()
        isPrepared = false
        mediaPlayer?.let {
            try {
                if (it.isPlaying) {
                    it.stop()
                }
                it.reset()
                it.release()
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing MediaPlayer: ${e.message}")
            }
        }
        mediaPlayer = null
        currentUrl = null
    }

    @ReactMethod
    fun play(url: String, promise: Promise) {
        try {
            if (url.isBlank()) {
                promise.reject("ERR_EMPTY_URL", "Audio URL cannot be empty")
                return
            }

            // If same audio is paused, just resume
            if (url == currentUrl && mediaPlayer != null && isPrepared) {
                mediaPlayer?.start()
                startProgressUpdates()
                emitStatus("playing", mediaPlayer?.currentPosition ?: 0, mediaPlayer?.duration ?: 0)
                promise.resolve("Resumed")
                return
            }

            // Release any existing player
            releasePlayer()
            currentUrl = url
            emitStatus("loading", 0, 0)

            var promiseSettled = false

            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(url)
                setOnPreparedListener { mp ->
                    isPrepared = true
                    mp.start()
                    startProgressUpdates()
                    val dur = mp.duration
                    Log.i(TAG, "MediaPlayer started playing: duration=${dur}ms")
                    emitStatus("playing", 0, dur)
                    if (!promiseSettled) {
                        promiseSettled = true
                        promise.resolve("Playing")
                    }
                }
                setOnCompletionListener {
                    stopProgressUpdates()
                    val dur = it.duration
                    Log.i(TAG, "MediaPlayer completed playback")
                    emitStatus("completed", dur, dur)
                }
                setOnErrorListener { _, what, extra ->
                    stopProgressUpdates()
                    isPrepared = false
                    val errMsg = "Playback error: what=$what extra=$extra"
                    Log.e(TAG, errMsg)
                    emitStatus("error", 0, 0, errMsg)
                    if (!promiseSettled) {
                        promiseSettled = true
                        promise.reject("ERR_PLAYBACK", errMsg)
                    }
                    true
                }
                prepareAsync()
            }
            mediaPlayer = player
        } catch (e: Exception) {
            Log.e(TAG, "Exception in play(): ${e.message}", e)
            emitStatus("error", 0, 0, e.message)
            promise.reject("ERR_PLAYBACK", e.message, e)
        }
    }

    @ReactMethod
    fun pause(promise: Promise) {
        try {
            val player = mediaPlayer
            if (player != null && isPrepared && player.isPlaying) {
                player.pause()
                stopProgressUpdates()
                val pos = player.currentPosition
                val dur = player.duration
                emitStatus("paused", pos, dur)
                promise.resolve("Paused")
            } else {
                promise.resolve("Not playing")
            }
        } catch (e: Exception) {
            promise.reject("ERR_PAUSE", e.message, e)
        }
    }

    @ReactMethod
    fun resume(promise: Promise) {
        try {
            val player = mediaPlayer
            if (player != null && isPrepared && !player.isPlaying) {
                player.start()
                startProgressUpdates()
                val pos = player.currentPosition
                val dur = player.duration
                emitStatus("playing", pos, dur)
                promise.resolve("Resumed")
            } else {
                promise.resolve("Cannot resume")
            }
        } catch (e: Exception) {
            promise.reject("ERR_RESUME", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            releasePlayer()
            emitStatus("paused", 0, 0)
            promise.resolve("Stopped")
        } catch (e: Exception) {
            promise.reject("ERR_STOP", e.message, e)
        }
    }

    @ReactMethod
    fun seekTo(positionMs: Double, promise: Promise) {
        try {
            val player = mediaPlayer
            if (player != null && isPrepared) {
                player.seekTo(positionMs.toInt())
                promise.resolve("Seeked")
            } else {
                promise.reject("ERR_SEEK", "Player is not initialized or prepared")
            }
        } catch (e: Exception) {
            promise.reject("ERR_SEEK", e.message, e)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            val player = mediaPlayer
            val isPlaying = player?.isPlaying ?: false
            val pos = if (isPrepared && player != null) player.currentPosition else 0
            val dur = if (isPrepared && player != null) player.duration else 0
            val map = Arguments.createMap().apply {
                putBoolean("isPlaying", isPlaying)
                putInt("position", pos)
                putInt("duration", dur)
                putBoolean("isPrepared", isPrepared)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_STATUS", e.message, e)
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        releasePlayer()
    }
}
