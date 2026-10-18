# Keep Capacitor classes & plugins
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.* <methods>;
    @com.getcapacitor.annotation.* <fields>;
}
-keep class androidx.** { *; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-dontwarn com.getcapacitor.**
-keep class com.my.tracker.MainActivity { *; }
