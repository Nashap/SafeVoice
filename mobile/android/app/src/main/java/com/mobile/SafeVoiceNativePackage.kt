package com.mobile

import android.util.Log
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import java.util.HashMap

class SafeVoiceNativePackage : BaseReactPackage() {

    companion object {
        private const val TAG = "SafeVoiceNativePackage"
    }

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        Log.i(TAG, "getModule requested for: $name")
        return when (name) {
            EmergencyAudioModule.NAME -> EmergencyAudioModule(reactContext)
            AudioPlayerModule.NAME -> AudioPlayerModule(reactContext)
            LocationHelperModule.NAME -> LocationHelperModule(reactContext)
            ProtectionServiceModule.NAME -> ProtectionServiceModule(reactContext)
            else -> null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        Log.i(TAG, "getReactModuleInfoProvider called")
        return ReactModuleInfoProvider {
            val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
            moduleInfos[EmergencyAudioModule.NAME] = ReactModuleInfo(
                EmergencyAudioModule.NAME,
                EmergencyAudioModule::class.java.name,
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // isCxxModule
                false  // isTurboModule
            )
            moduleInfos[AudioPlayerModule.NAME] = ReactModuleInfo(
                AudioPlayerModule.NAME,
                AudioPlayerModule::class.java.name,
                false,
                false,
                false,
                false
            )
            moduleInfos[LocationHelperModule.NAME] = ReactModuleInfo(
                LocationHelperModule.NAME,
                LocationHelperModule::class.java.name,
                false,
                false,
                false,
                false
            )
            moduleInfos[ProtectionServiceModule.NAME] = ReactModuleInfo(
                ProtectionServiceModule.NAME,
                ProtectionServiceModule::class.java.name,
                false,
                false,
                false,
                false
            )
            moduleInfos
        }
    }

    @Suppress("DEPRECATION")
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        Log.i(TAG, "createNativeModules called")
        return listOf(
            AudioPlayerModule(reactContext),
            LocationHelperModule(reactContext),
            EmergencyAudioModule(reactContext),
            ProtectionServiceModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}