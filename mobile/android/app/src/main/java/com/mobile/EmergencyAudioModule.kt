package com.mobile

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vosk.CustomSpeechService
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

@ReactModule(name = EmergencyAudioModule.NAME)
class EmergencyAudioModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var isStandaloneCapturing = false

    companion object {
        const val NAME = "EmergencyAudioModule"
        private const val TAG = "EmergencyAudioModule"
        private const val SAMPLE_RATE = 16000
        private const val DURATION_SECONDS = 15.0f
        @Volatile var isStandaloneCapturing = false
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun sendEvent(eventName: String, data: String) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
        }
    }

    @ReactMethod
    fun triggerEmergencyCapture(tag: String, promise: Promise) {
        Log.i(TAG, "[AUDIO_EVIDENCE] triggerEmergencyCapture called with tag: " + tag)

        // 1. Primary strategy: Re-use active CustomSpeechService (Vosk) PCM stream if running
        val speechService = CustomSpeechService.activeInstance
        if (speechService != null && speechService.isRunning()) {
            try {
                Log.i(TAG, "[AUDIO_EVIDENCE] Vosk CustomSpeechService is active and running. Reusing existing microphone stream with 5s pre-buffer for tag: $tag")
                val ok = speechService.triggerEmergencyCapture(tag)
                if (ok) {
                    Log.i(TAG, "[AUDIO_EVIDENCE] Successfully delegated emergency capture to active CustomSpeechService for tag: $tag")
                    promise.resolve("Capture started via CustomSpeechService with 5s pre-buffer")
                    return
                } else {
                    Log.w(TAG, "[AUDIO_EVIDENCE] CustomSpeechService.triggerEmergencyCapture returned false")
                    promise.reject("ERR_CAPTURE_FAILED", "CustomSpeechService failed to start emergency capture")
                    return
                }
            } catch (e: Exception) {
                Log.e(TAG, "[AUDIO_EVIDENCE] Exception calling CustomSpeechService: " + e.message, e)
                promise.reject("ERR_CAPTURE_EXCEPTION", e.message)
                return
            }
        } else {
            Log.i(TAG, "[AUDIO_EVIDENCE] CustomSpeechService is not actively running. Preparing standalone 15s AudioRecord")
        }

        // 2. Standalone strategy: Used when Protection Mode is OFF (e.g. manual SOS triggered)
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "[AUDIO_EVIDENCE] RECORD_AUDIO permission not granted")
            promise.reject("ERR_PERMISSION", "RECORD_AUDIO permission is not granted")
            return
        }

        if (isStandaloneCapturing) {
            Log.w(TAG, "[AUDIO_EVIDENCE] Standalone audio capture is already in progress")
            promise.resolve("Capture already in progress")
            return
        }

        isStandaloneCapturing = true
        startStandaloneCapture(tag)
        promise.resolve("Standalone 15s audio capture started")
    }

    private fun startStandaloneCapture(tag: String) {
        Thread {
            val totalTargetSamples = (SAMPLE_RATE * DURATION_SECONDS).toInt()
            val minBufSize = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            val bufferSize = maxOf(minBufSize * 4, 3200 * 2)

            val sources = intArrayOf(
                MediaRecorder.AudioSource.MIC,
                MediaRecorder.AudioSource.DEFAULT,
                MediaRecorder.AudioSource.VOICE_RECOGNITION
            )

            var recorder: AudioRecord? = null
            var chosenSource = -1
            for (source in sources) {
                try {
                    val rec = AudioRecord(
                        source,
                        SAMPLE_RATE,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufferSize
                    )
                    val sourceName = when (source) {
                        MediaRecorder.AudioSource.MIC -> "MIC (1)"
                        MediaRecorder.AudioSource.DEFAULT -> "DEFAULT (0)"
                        MediaRecorder.AudioSource.VOICE_RECOGNITION -> "VOICE_RECOGNITION (6)"
                        else -> "$source"
                    }
                    if (rec.state == AudioRecord.STATE_INITIALIZED) {
                        Log.i(TAG, "[AUDIO_EVIDENCE] Standalone AudioRecord initialized: source=$sourceName, sampleRate=$SAMPLE_RATE, channel=CHANNEL_IN_MONO, encoding=ENCODING_PCM_16BIT, bufferSize=$bufferSize, minBufferSize=$minBufSize, state=${rec.state}")
                        recorder = rec
                        chosenSource = source
                        break
                    } else {
                        Log.w(TAG, "[AUDIO_EVIDENCE] Standalone AudioRecord state was not INITIALIZED for source=$sourceName (state=${rec.state})")
                        rec.release()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "[AUDIO_EVIDENCE] Failed initializing source $source: ${e.message}")
                }
            }

            if (recorder == null) {
                Log.e(TAG, "[AUDIO_EVIDENCE] Standalone AudioRecord failed to initialize with all sources")
                isStandaloneCapturing = false
                val failPayload = org.json.JSONObject().apply {
                    put("status", "failed")
                    put("error", "Microphone AudioRecord failed to initialize")
                    put("tag", tag)
                }.toString()
                mainHandler.post {
                    sendEvent("onEmergencyAudioFailure", failPayload)
                }
                return@Thread
            }

            try {
                recorder.startRecording()
                Log.i(TAG, "[AUDIO_EVIDENCE] Standalone AudioRecord started: recordingState=${recorder.recordingState}, targetSamples=$totalTargetSamples")

                if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                    Log.e(TAG, "[AUDIO_EVIDENCE] AudioRecord failed to enter RECORDING state: state=${recorder.recordingState}")
                    isStandaloneCapturing = false
                    val failPayload = org.json.JSONObject().apply {
                        put("status", "failed")
                        put("error", "AudioRecord failed to enter recording state")
                        put("tag", tag)
                    }.toString()
                    mainHandler.post {
                        sendEvent("onEmergencyAudioFailure", failPayload)
                    }
                    return@Thread
                }

                val samples = ShortArray(totalTargetSamples)
                var totalRead = 0
                val chunk = ShortArray(1600) // 100ms chunks

                var sumSquaresTotal = 0.0
                var minSampleTotal = Short.MAX_VALUE
                var maxSampleTotal = Short.MIN_VALUE
                var zeroCountTotal = 0
                var chunkCounter = 0

                while (isStandaloneCapturing && totalRead < totalTargetSamples) {
                    val toRead = minOf(chunk.size, totalTargetSamples - totalRead)
                    val read = try {
                        recorder.read(chunk, 0, toRead)
                    } catch (e: Exception) {
                        Log.e(TAG, "[AUDIO_EVIDENCE] Exception reading AudioRecord: ${e.message}")
                        -1
                    }

                    if (read > 0) {
                        System.arraycopy(chunk, 0, samples, totalRead, read)
                        totalRead += read

                        var chunkSumSq = 0.0
                        var chunkMin = Short.MAX_VALUE
                        var chunkMax = Short.MIN_VALUE
                        var chunkZeros = 0
                        for (i in 0 until read) {
                            val s = chunk[i]
                            if (s == 0.toShort()) chunkZeros++
                            if (s < chunkMin) chunkMin = s
                            if (s > chunkMax) chunkMax = s
                            val sd = s.toDouble()
                            chunkSumSq += sd * sd
                        }

                        // Accumulate overall
                        zeroCountTotal += chunkZeros
                        if (chunkMin < minSampleTotal) minSampleTotal = chunkMin
                        if (chunkMax > maxSampleTotal) maxSampleTotal = chunkMax
                        sumSquaresTotal += chunkSumSq

                        chunkCounter++
                        if (chunkCounter % 10 == 0) { // Every 1.0 second
                            val chunkRms = kotlin.math.sqrt(chunkSumSq / read)
                            val chunkRmsStr = String.format(java.util.Locale.US, "%.2f", chunkRms)
                            val chunkZeroPct = String.format(java.util.Locale.US, "%.1f", (chunkZeros.toDouble() / read.toDouble()) * 100.0)
                            val indicator = if (chunkRms > 50.0) "SPEECH_DETECTED" else if (chunkRms > 10.0) "AMBIENT_NOISE" else "SILENCE"
                            Log.i(TAG, "[AUDIO_EVIDENCE_STANDALONE] PCM_DIAG: totalRead=$totalRead/$totalTargetSamples, chunkRead=$read, min=$chunkMin, max=$chunkMax, zeros=$chunkZeros/$read (${chunkZeroPct}%), rms=$chunkRmsStr, signal=$indicator")
                        }
                    } else if (read < 0) {
                        Log.e(TAG, "[AUDIO_EVIDENCE] Standalone AudioRecord.read error code: $read")
                        break
                    }
                }

                try {
                    recorder.stop()
                    recorder.release()
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping standalone recorder: " + e.message)
                }
                recorder = null

                if (totalRead > 0) {
                    val safeTag = tag.replace("[^a-zA-Z0-9_-]".toRegex(), "_")
                    val filename = "emergency_" + safeTag + "_" + System.currentTimeMillis() + ".wav"
                    val dir = reactContext.cacheDir
                    if (!dir.exists()) dir.mkdirs()
                    val outFile = File(dir, filename)

                    writeWavFile(outFile, samples, totalRead, SAMPLE_RATE)
                    val actualDuration = totalRead.toDouble() / SAMPLE_RATE.toDouble()
                    val totalRms = kotlin.math.sqrt(sumSquaresTotal / totalRead)
                    val totalZeroPercent = (zeroCountTotal.toDouble() / totalRead.toDouble()) * 100.0
                    val rmsStr = String.format(java.util.Locale.US, "%.2f", totalRms)
                    val zeroPctStr = String.format(java.util.Locale.US, "%.2f", totalZeroPercent)

                    Log.i(TAG, "[AUDIO_EVIDENCE] Standalone clip saved: ${outFile.absolutePath}, bytes=${outFile.length()}, duration=${actualDuration}s, min=$minSampleTotal, max=$maxSampleTotal, rms=$rmsStr, zeros=$zeroCountTotal/$totalRead (${zeroPctStr}%)")

                    val isEssentiallySilent = totalZeroPercent >= 99.0 && totalRms < 2.5
                    if (isEssentiallySilent) {
                        Log.e(TAG, "[AUDIO_EVIDENCE] Standalone capture FAILED: Microphone input was unavailable or silent (RMS=$rmsStr, zeros=${zeroPctStr}%). Not treating silence as successful recording.")
                        val failPayload = org.json.JSONObject().apply {
                            put("status", "failed")
                            put("error", "Microphone input was unavailable or silent (RMS=$rmsStr, zeros=${zeroPctStr}%)")
                            put("filePath", outFile.absolutePath)
                            put("rms", totalRms)
                            put("zeroPercent", totalZeroPercent)
                            put("tag", tag)
                        }.toString()
                        mainHandler.post {
                            sendEvent("onEmergencyAudioFailure", failPayload)
                        }
                        return@Thread
                    }

                    Log.i(TAG, "[AUDIO_EVIDENCE] Standalone capture SUCCESS: Real microphone audio captured (RMS=$rmsStr, min=$minSampleTotal, max=$maxSampleTotal)")

                    val jsonPayload = org.json.JSONObject().apply {
                        put("filePath", outFile.absolutePath)
                        put("duration", actualDuration)
                        put("sampleRate", SAMPLE_RATE)
                        put("sizeBytes", outFile.length())
                        put("rms", totalRms)
                        put("minSample", minSampleTotal.toInt())
                        put("maxSample", maxSampleTotal.toInt())
                        put("zeroPercent", totalZeroPercent)
                        put("tag", tag)
                    }.toString()

                    mainHandler.post {
                        sendEvent("onEmergencyAudioReady", jsonPayload)
                    }
                } else {
                    Log.w(TAG, "[AUDIO_EVIDENCE] No audio samples captured in standalone recorder")
                    val failPayload = org.json.JSONObject().apply {
                        put("status", "failed")
                        put("error", "No audio samples captured from microphone")
                        put("tag", tag)
                    }.toString()
                    mainHandler.post {
                        sendEvent("onEmergencyAudioFailure", failPayload)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "[AUDIO_EVIDENCE] Exception in standalone capture: " + e.message, e)
                val failPayload = org.json.JSONObject().apply {
                    put("status", "failed")
                    put("error", "Exception in audio capture: " + e.message)
                    put("tag", tag)
                }.toString()
                mainHandler.post {
                    sendEvent("onEmergencyAudioFailure", failPayload)
                }
            } finally {
                try {
                    recorder?.release()
                } catch (e: Exception) {}
                isStandaloneCapturing = false
            }
        }.start()
    }

    private fun writeWavFile(file: File, samples: ShortArray, numSamples: Int, sampleRate: Int) {
        val totalDataLen = (numSamples * 2).toLong()
        val totalAudioLen = totalDataLen + 36
        val byteRate = (sampleRate * 1 * 2).toLong()

        val header = ByteArray(44)
        header[0] = 'R'.code.toByte()
        header[1] = 'I'.code.toByte()
        header[2] = 'F'.code.toByte()
        header[3] = 'F'.code.toByte()
        header[4] = (totalAudioLen and 0xff).toByte()
        header[5] = ((totalAudioLen shr 8) and 0xff).toByte()
        header[6] = ((totalAudioLen shr 16) and 0xff).toByte()
        header[7] = ((totalAudioLen shr 24) and 0xff).toByte()
        header[8] = 'W'.code.toByte()
        header[9] = 'A'.code.toByte()
        header[10] = 'V'.code.toByte()
        header[11] = 'E'.code.toByte()
        header[12] = 'f'.code.toByte()
        header[13] = 'm'.code.toByte()
        header[14] = 't'.code.toByte()
        header[15] = ' '.code.toByte()
        header[16] = 16
        header[17] = 0
        header[18] = 0
        header[19] = 0
        header[20] = 1 // PCM format
        header[21] = 0
        header[22] = 1 // Mono channel
        header[23] = 0
        header[24] = (sampleRate and 0xff).toByte()
        header[25] = ((sampleRate shr 8) and 0xff).toByte()
        header[26] = ((sampleRate shr 16) and 0xff).toByte()
        header[27] = ((sampleRate shr 24) and 0xff).toByte()
        header[28] = (byteRate and 0xff).toByte()
        header[29] = ((byteRate shr 8) and 0xff).toByte()
        header[30] = ((byteRate shr 16) and 0xff).toByte()
        header[31] = ((byteRate shr 24) and 0xff).toByte()
        header[32] = 2 // 16-bit mono block align
        header[33] = 0
        header[34] = 16 // 16 bits per sample
        header[35] = 0
        header[36] = 'd'.code.toByte()
        header[37] = 'a'.code.toByte()
        header[38] = 't'.code.toByte()
        header[39] = 'a'.code.toByte()
        header[40] = (totalDataLen and 0xff).toByte()
        header[41] = ((totalDataLen shr 8) and 0xff).toByte()
        header[42] = ((totalDataLen shr 16) and 0xff).toByte()
        header[43] = ((totalDataLen shr 24) and 0xff).toByte()

        FileOutputStream(file).use { out ->
            out.write(header, 0, 44)
            val byteBuffer = ByteBuffer.allocate(numSamples * 2).order(ByteOrder.LITTLE_ENDIAN)
            for (i in 0 until numSamples) {
                byteBuffer.putShort(samples[i])
            }
            out.write(byteBuffer.array(), 0, numSamples * 2)
        }
    }
}