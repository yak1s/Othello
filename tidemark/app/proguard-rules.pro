# JavaScript bridges used by the checker, picker and recorder.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
# Enum names are stored in the database and JSON.
-keepclassmembers enum app.tidemark.** { *; }
# kotlinx.serialization (the library ships its own rules; keep our serializers' companions too).
-keepclassmembers @kotlinx.serialization.Serializable class app.tidemark.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepattributes *Annotation*, InnerClasses, Signature
-dontwarn org.jspecify.annotations.**
-dontwarn com.google.re2j.**
