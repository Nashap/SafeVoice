package com.mobile

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          Log.i("MainApplication", "[PACKAGE_REGISTRATION] Registering SafeVoiceNativePackage")
          add(SafeVoiceNativePackage())
        },
      useDevSupport = true,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
