# Flutter + plugins keep rules for R8 release builds.
# Flutter's own rules are applied automatically; these are extra safety keeps.

# flutter_secure_storage (uses AndroidX security crypto)
-keep class androidx.security.crypto.** { *; }

# geolocator / Google Play services location
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep annotations and native-method signatures used via JNI
-keepattributes *Annotation*
-keepclasseswithmembernames class * { native <methods>; }
