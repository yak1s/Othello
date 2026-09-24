package app.tidemark.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.tidemark.AppContainer
import app.tidemark.container

/**
 * ViewModel helper for screens: `val vm = tidemarkViewModel { c -> WatchesViewModel(c) }`.
 * [key] distinguishes instances (e.g. one detail VM per watch id).
 */
@Composable
inline fun <reified VM : ViewModel> tidemarkViewModel(key: String? = null, crossinline create: (AppContainer) -> VM): VM {
    val container = LocalContext.current.container
    return viewModel(key = key, factory = viewModelFactory { initializer { create(container) } })
}
