package app.tidemark.core.flights

import app.tidemark.core.extract.Money
import app.tidemark.core.model.FlightQuery
import java.time.LocalDate

/**
 * Rebuilds the Google Flights search URL from saved fields on every check (never a stale URL):
 * https://www.google.com/travel/flights?q=Flights%20to%20LHR%20from%20JFK%20on%202026-11-10%20through%202026-11-17%20nonstop%20business&curr=USD&hl=en
 */
object GoogleFlightsUrl {
    fun build(query: FlightQuery, departDate: String = query.departDate): String = TODO("flights package")
}

/** The dates a flexible-window watch checks: departDate ± flexDays, never in the past. */
object FlexWindow {
    fun dates(query: FlightQuery, today: LocalDate): List<LocalDate> = TODO("flights package")
}

data class FareReading(val price: Money, val evidence: String)

/**
 * Reads the cheapest fare from a rendered results page by anchoring on visible text (class names
 * change): the "Best"/"Cheapest"/"departing flights" sections, "round trip"/"one way" price labels.
 * Ignores price-graph/calendar numbers, "typical price" ranges and baggage fees.
 */
object FareTextReader {
    fun read(visibleText: String, query: FlightQuery): FareReading? = TODO("flights package")
}

/** An HTTP request described as data (core does no I/O). */
data class HttpRequestSpec(
    val method: String,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
)

/** Optional fare APIs. Keys live in the secret store; request building and parsing are here. */
object FareApis {
    /** Duffel: POST https://api.duffel.com/air/offer_requests?return_offers=true, header "Duffel-Version: v2". */
    fun duffelRequest(query: FlightQuery, token: String, departDate: String = query.departDate): HttpRequestSpec =
        TODO("flights package")

    fun parseDuffel(body: String): Money? = TODO("flights package")

    /** Amadeus self-service: token via client_credentials, then GET /v2/shopping/flight-offers. */
    fun amadeusTokenRequest(clientId: String, clientSecret: String): HttpRequestSpec = TODO("flights package")
    fun parseAmadeusToken(body: String): String? = TODO("flights package")
    fun amadeusSearchRequest(query: FlightQuery, accessToken: String, departDate: String = query.departDate): HttpRequestSpec =
        TODO("flights package")

    fun parseAmadeus(body: String): Money? = TODO("flights package")

    /** Kiwi Tequila: GET https://api.tequila.kiwi.com/v2/search with header "apikey". */
    fun kiwiRequest(query: FlightQuery, apiKey: String, departDate: String = query.departDate): HttpRequestSpec =
        TODO("flights package")

    fun parseKiwi(body: String): Money? = TODO("flights package")
}

/**
 * Parses Google Flights price-alert notifications (from Gmail) into a hint: which route moved.
 * A hint only triggers an immediate check; it never alerts on its own.
 */
object FlightEmailHints {
    data class Hint(val origin: String?, val destination: String?, val price: Money?)

    fun parse(title: String, text: String): Hint? = TODO("flights package")
}
