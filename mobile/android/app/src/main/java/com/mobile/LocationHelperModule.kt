package com.mobile

import android.location.Address
import android.location.Geocoder
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.util.Locale

@ReactModule(name = LocationHelperModule.NAME)
class LocationHelperModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LocationHelperModule"
        private const val TAG = "LocationHelperModule"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun reverseGeocode(latitude: Double, longitude: Double, promise: Promise) {
        if (latitude == 0.0 && longitude == 0.0) {
            val fallback = Arguments.createMap().apply {
                putString("address", "Location unavailable")
                putString("placeName", "")
                putString("city", "")
                putString("state", "")
                putString("country", "")
                putString("googleMapsUrl", "")
            }
            promise.resolve(fallback)
            return
        }
        Thread {
            try {
                if (!Geocoder.isPresent()) {
                    Log.w(TAG, "Android Geocoder is not present on this device/emulator.")
                    val fallback = Arguments.createMap().apply {
                        putString("address", "Address unavailable (Geocoder not supported)")
                        putString("placeName", "")
                        putString("city", "")
                        putString("state", "")
                        putString("country", "")
                        putString("googleMapsUrl", "https://www.google.com/maps/search/?api=1&query=$latitude,$longitude")
                    }
                    promise.resolve(fallback)
                    return@Thread
                }

                val geocoder = Geocoder(reactContext, Locale.getDefault())
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    geocoder.getFromLocation(latitude, longitude, 1) { addresses ->
                        handleAddresses(addresses, latitude, longitude, promise)
                    }
                } else {
                    @Suppress("DEPRECATION")
                    val addresses = geocoder.getFromLocation(latitude, longitude, 1)
                    handleAddresses(addresses, latitude, longitude, promise)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Geocoding failed for $latitude, $longitude: ${e.message}")
                val fallback = Arguments.createMap().apply {
                    putString("address", "Address unavailable")
                    putString("placeName", "")
                    putString("city", "")
                    putString("state", "")
                    putString("country", "")
                    putString("googleMapsUrl", "https://www.google.com/maps/search/?api=1&query=$latitude,$longitude")
                }
                promise.resolve(fallback)
            }
        }.start()
    }

    private fun handleAddresses(
        addresses: List<Address>?,
        latitude: Double,
        longitude: Double,
        promise: Promise
    ) {
        val googleMapsUrl = "https://www.google.com/maps/search/?api=1&query=$latitude,$longitude"
        if (addresses.isNullOrEmpty()) {
            val map = Arguments.createMap().apply {
                putString("address", "Address unavailable")
                putString("placeName", "")
                putString("city", "")
                putString("state", "")
                putString("country", "")
                putString("googleMapsUrl", googleMapsUrl)
            }
            promise.resolve(map)
            return
        }

        val addr = addresses[0]
        val fullAddress = if (addr.maxAddressLineIndex >= 0) {
            addr.getAddressLine(0)
        } else {
            listOfNotNull(
                addr.featureName,
                addr.subLocality,
                addr.locality,
                addr.adminArea,
                addr.postalCode,
                addr.countryName
            ).joinToString(", ")
        }

        val placeName = addr.featureName ?: addr.subLocality ?: ""
        val city = addr.locality ?: addr.subAdminArea ?: ""
        val state = addr.adminArea ?: ""
        val postalCode = addr.postalCode ?: ""
        val country = addr.countryName ?: ""

        val map = Arguments.createMap().apply {
            putString("address", if (fullAddress.isNotBlank()) fullAddress else "Address unavailable")
            putString("placeName", placeName)
            putString("city", city)
            putString("state", state)
            putString("postalCode", postalCode)
            putString("country", country)
            putString("googleMapsUrl", googleMapsUrl)
        }
        promise.resolve(map)
    }
}
