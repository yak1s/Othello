package app.tidemark.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class Cabin { ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST }

@Serializable
enum class Stops { ANY, NONSTOP, ONE_OR_FEWER, TWO_OR_FEWER }

/**
 * Saved fields for a flight watch. The search URL is rebuilt from these on every check;
 * a stale URL is never replayed. Dates are ISO yyyy-MM-dd.
 */
@Serializable
data class FlightQuery(
    val origin: String,
    val destination: String,
    val departDate: String,
    val returnDate: String? = null,
    val cabin: Cabin = Cabin.ECONOMY,
    val stops: Stops = Stops.ANY,
    val adults: Int = 1,
    /** Flexible window: also check this many days either side of [departDate] (0 = fixed date, max 3 => 7 days). */
    val flexDays: Int = 0,
    val currency: String? = null,
)

/** Which fare API to use when the user supplied a key. */
@Serializable
enum class FareApi { DUFFEL, AMADEUS, KIWI }
