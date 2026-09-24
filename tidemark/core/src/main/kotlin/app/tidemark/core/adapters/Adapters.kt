package app.tidemark.core.adapters

import app.tidemark.core.model.SiteAdapter

/** Site adapters loaded from data files. The app reads assets/adapters/[*].json and passes the texts in. */
class AdapterRegistry(val adapters: List<SiteAdapter>) {
    /** Best adapter for [url] (host suffix match), or by [html] platform markers when the host is unknown. */
    fun match(url: String, html: String? = null): SiteAdapter? = TODO("adapters package")

    /** The API tap URL for [url] under [adapter], or null when the adapter has no tap or the URL doesn't fit. */
    fun apiTapUrl(adapter: SiteAdapter, url: String): String? = TODO("adapters package")

    companion object {
        /** Parse adapter files; bad files are skipped (reported through [onError]), never crash. */
        fun fromJson(files: Map<String, String>, onError: (String, Throwable) -> Unit = { _, _ -> }): AdapterRegistry =
            TODO("adapters package")
    }
}

/** Canonical URLs: lowercase host, no fragment, tracking params dropped (utm_*, gclid, fbclid, ref, tag, ...). */
object UrlCanon {
    fun canonical(url: String, adapter: SiteAdapter? = null): String = TODO("adapters package")

    /** First http(s) URL inside shared text ("Check this out https://amzn.eu/d/abc"), or null. */
    fun firstUrlIn(text: String): String? = TODO("adapters package")
}
