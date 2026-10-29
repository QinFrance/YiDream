package com.yidream.mdm

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.util.UUID

/** Native catalog and website requests, independent from the administrator website. */
class MdmPortalController(private val activity: AppCompatActivity) {
    private val service = MdmService(activity)
    private var storeGeneration = 0
    private var sitesGeneration = 0
    private val store get() = activity.findViewById<LinearLayout>(R.id.storeContent)
    private val sites get() = activity.findViewById<LinearLayout>(R.id.sitesContent)
    private fun text(id: Int) = activity.getString(id)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun label(parent: LinearLayout, value: String, title: Boolean = false): TextView = TextView(activity).also {
        it.text = value; it.textSize = if (title) 22f else 15f
        it.setTextColor(activity.getColor(R.color.accent_navy))
        it.setPadding(dp(18), dp(14), dp(18), dp(14))
        it.setBackgroundResource(R.drawable.bg_glass_card)
        parent.addView(it, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) })
    }
    private fun action(parent: LinearLayout, title: String, run: () -> Unit): Button = Button(activity).also {
        it.text = title; it.isAllCaps = false; it.minHeight = dp(48)
        parent.addView(it, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
        it.setOnClickListener { run() }
    }
    private fun message(error: Throwable): String = text(when (error.message) {
        "INVALID_SITE" -> R.string.mdm_invalid_site
        "SERVICE_NOT_READY" -> R.string.mdm_service_missing
        else -> R.string.mdm_network_error
    })
    private fun needsPairing(parent: LinearLayout): Boolean {
        if (service.paired) return false
        label(parent, text(R.string.mdm_pair_description))
        action(parent, text(R.string.mdm_pair)) { pair() }
        return true
    }
    fun pair() {
        val code = EditText(activity).apply {
            hint = text(R.string.mdm_pair_code)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            setSingleLine()
        }
        val dialog = AlertDialog.Builder(activity).setTitle(R.string.mdm_pair).setView(code)
            .setPositiveButton(R.string.mdm_connect, null).setNegativeButton(android.R.string.cancel, null).create()
        dialog.setOnShowListener {
            val button = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            button.setOnClickListener {
                button.isEnabled = false
                activity.lifecycleScope.launch {
                    try {
                        service.pair(code.text.toString()); dialog.dismiss(); refreshStore(); refreshSites()
                    } catch (error: Exception) { code.error = message(error) }
                    finally { button.isEnabled = true }
                }
            }
        }
        dialog.show()
    }
    fun refreshStore() {
        val generation = ++storeGeneration
        store.removeAllViews()
        label(store, text(R.string.mdm_catalog_description))
        if (needsPairing(store)) return
        val state = label(store, text(R.string.mdm_loading))
        activity.lifecycleScope.launch {
            try {
                val apps = service.catalog()
                if (generation != storeGeneration) return@launch
                store.removeView(state)
                if (apps.length() == 0) label(store, text(R.string.mdm_empty_catalog))
                for (i in 0 until apps.length()) {
                    val app = apps.getJSONObject(i)
                    label(store, app.getString("name"), true)
                    label(store, app.optString("description"))
                    val install = action(store, text(R.string.mdm_install)) { }
                    install.setOnClickListener {
                        install.isEnabled = false
                        activity.lifecycleScope.launch {
                            try {
                                val result = CatalogInstaller(activity).install(app)
                                install.text = when (result) {
                                    is SilentInstaller.Result.Success -> text(R.string.mdm_install_submitted)
                                    is SilentInstaller.Result.Failure -> text(R.string.mdm_install_failed)
                                }
                            } catch (_: Exception) { install.text = text(R.string.mdm_install_failed) }
                            finally { install.isEnabled = true }
                        }
                    }
                }
            } catch (error: Exception) { state.text = message(error) }
            if (generation != storeGeneration) return@launch
            action(store, text(R.string.mdm_refresh)) { refreshStore() }
        }
    }
    fun refreshSites() {
        val generation = ++sitesGeneration
        sites.removeAllViews()
        label(sites, text(R.string.mdm_sites_title), true)
        label(sites, text(R.string.mdm_sites_description))
        if (needsPairing(sites)) return
        action(sites, text(R.string.mdm_new_request)) { requestDialog() }
        val state = label(sites, text(R.string.mdm_loading))
        activity.lifecycleScope.launch {
            try {
                val requests = service.requests()
                if (generation != sitesGeneration) return@launch
                sites.removeView(state)
                if (requests.length() == 0) label(sites, text(R.string.mdm_empty_requests))
                for (i in 0 until requests.length()) {
                    val item = requests.getJSONObject(i)
                    val status = text(when (item.getString("status")) {
                        "approved" -> R.string.mdm_approved
                        "rejected" -> R.string.mdm_rejected
                        else -> R.string.mdm_pending
                    })
                    label(sites, item.getString("site_url") + "\n" + status +
                        item.optString("admin_note").takeIf { it.isNotBlank() }?.let { "\n$it" }.orEmpty())
                }
            } catch (error: Exception) { state.text = message(error) }
            if (generation != sitesGeneration) return@launch
            action(sites, text(R.string.mdm_refresh)) { refreshSites() }
        }
    }
    private fun requestDialog() {
        val form = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(8), dp(20), 0) }
        val address = EditText(activity).apply { hint = text(R.string.mdm_site_url); inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI; setSingleLine() }
        val reason = EditText(activity).apply { hint = text(R.string.mdm_reason); maxLines = 4 }
        form.addView(address); form.addView(reason)
        val requestId = UUID.randomUUID().toString()
        val dialog = AlertDialog.Builder(activity).setTitle(R.string.mdm_new_request).setView(form)
            .setPositiveButton(R.string.mdm_send, null).setNegativeButton(android.R.string.cancel, null).create()
        dialog.setOnShowListener {
            val button = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            button.setOnClickListener {
                try { MdmService.normalizeSite(address.text.toString()) }
                catch (_: Exception) { address.error = text(R.string.mdm_invalid_site); return@setOnClickListener }
                button.isEnabled = false
                activity.lifecycleScope.launch {
                    try {
                        service.requestSite(address.text.toString(), reason.text.toString(), requestId)
                        dialog.dismiss(); refreshSites()
                    } catch (error: Exception) { address.error = message(error) }
                    finally { button.isEnabled = true }
                }
            }
        }
        dialog.show()
    }
}
