package app.tidemark.ui.add

import androidx.compose.runtime.Composable

/**
 * The add sheet: starts fetching immediately, shows title, image, price and stock state as they
 * arrive, preselects a condition, one primary button "Track it". [duplicateOf] prefills from an
 * existing watch. Owned by the ui-app package.
 */
@Composable
fun AddSheet(initialUrl: String?, duplicateOf: Long?, onDismiss: () -> Unit): Unit = TODO("ui-app package")
