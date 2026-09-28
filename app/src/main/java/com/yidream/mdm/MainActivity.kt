package com.yidream.mdm

import android.app.AlertDialog
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

class MainActivity : AppCompatActivity() {

    companion object {
        // Seule source d'installation autorisée — volontairement fixe, pas
        // configurable à distance. Une page catalogue comme apny héberge
        // généralement la page elle-même sur GitHub Pages, mais les
        // fichiers .apk eux-mêmes sur GitHub Releases (domaine différent) —
        // on autorise donc tout l'écosystème GitHub officiel lié à ce repo,
        // jamais un domaine extérieur.
        const val STORE_URL = "https://ashivered.github.io/apny/"
        val ALLOWED_STORE_HOSTS = setOf(
            "ashivered.github.io",
            "github.com",
            "objects.githubusercontent.com",
            "raw.githubusercontent.com",
            "release-assets.githubusercontent.com"
        )
    }

    private lateinit var deviceOwnerManager: DeviceOwnerManager
    private lateinit var updateManager: UpdateManager
    private lateinit var unlockManager: UnlockManager
    private lateinit var silentInstaller: SilentInstaller

    private lateinit var pages: Map<String, View>
    private lateinit var tabs: Map<String, View>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        deviceOwnerManager = DeviceOwnerManager(this)
        updateManager = UpdateManager(this)
        unlockManager = UnlockManager(this)
        silentInstaller = SilentInstaller(this)

        pages = mapOf(
            "home" to findViewById(R.id.pageHome),
            "store" to findViewById(R.id.pageStore),
            "settings" to findViewById(R.id.pageSettings),
            "about" to findViewById(R.id.pageAbout)
        )
        tabs = mapOf(
            "home" to findViewById(R.id.tabHome),
            "store" to findViewById(R.id.tabStore),
            "settings" to findViewById(R.id.tabSettings),
            "about" to findViewById(R.id.tabAbout)
        )

        tabs.forEach { (key, view) -> view.setOnClickListener { selectTab(key) } }

        setupStoreWebView()
        setupLanguagePicker()
        refreshStatus()
        setupVersionAndContact()

        findViewById<View>(R.id.rowUpdates).setOnClickListener { onUpdatesClicked() }
        findViewById<View>(R.id.rowRemoveFilter).setOnClickListener { onRemoveFilterClicked() }

        selectTab("home")
        importWebAdbConfigIfPresent()
    }

    // ------------------------------------------------------------------
    // Navigation par onglets
    // ------------------------------------------------------------------

    private fun selectTab(key: String) {
        pages.forEach { (k, v) -> v.visibility = if (k == key) View.VISIBLE else View.GONE }
        tabs.forEach { (k, v) ->
            v.alpha = if (k == key) 1.0f else 0.5f
        }
    }

    // ------------------------------------------------------------------
    // App Store — WebView verrouillée sur une seule source
    // ------------------------------------------------------------------

    private fun setupStoreWebView() {
        val webView = findViewById<WebView>(R.id.storeWebView)
        val progress = findViewById<ProgressBar>(R.id.storeProgress)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                // "contains" plutôt que "endsWith" : beaucoup de liens de
                // téléchargement ont des paramètres après ".apk" (ex: ?token=...)
                if (url.contains(".apk", ignoreCase = true)) {
                    handleApkLink(url)
                    return true
                }
                val host = try { Uri.parse(url).host } catch (e: Exception) { null }
                return host != null && !isAllowedHost(host)
            }
        }

        webView.setDownloadListener { url, _, _, _, _ ->
            // Le DownloadListener se déclenche dès qu'Android reconnaît un
            // contenu non affichable (comme une APK) — indépendamment de la
            // forme exacte de l'URL, c'est le filet de sécurité le plus fiable.
            handleApkLink(url)
        }
        webView.loadUrl(STORE_URL)
    }

    private fun isAllowedHost(host: String): Boolean =
        ALLOWED_STORE_HOSTS.any { host.equals(it, ignoreCase = true) || host.endsWith(".$it", ignoreCase = true) }

    private fun handleApkLink(url: String) {
        val host = try { Uri.parse(url).host } catch (e: Exception) { null }
        if (host == null || !isAllowedHost(host)) {
            Toast.makeText(this, "Source non autorisée — installation refusée.", Toast.LENGTH_LONG).show()
            return
        }

        Toast.makeText(this, "Installation en cours…", Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            val result = silentInstaller.downloadAndInstall(url)
            val message = when (result) {
                is SilentInstaller.Result.Success -> "✅ Installé."
                is SilentInstaller.Result.Failure -> "❌ Échec : ${result.message}"
            }
            Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
        }
    }

    // ------------------------------------------------------------------
    // Réglages — langue
    // ------------------------------------------------------------------

    private data class LangOption(val tag: String, val flag: String, val label: String)

    private fun setupLanguagePicker() {
        val options = listOf(
            LangOption("en", "🇬🇧🇺🇸", "English"),
            LangOption("fr", "🇫🇷", "Français"),
            LangOption("he", "🇮🇱", "עברית"),
            LangOption("yi", "📖", "יידיש")
        )

        val row = findViewById<LinearLayout>(R.id.languageRow)
        row.removeAllViews()

        options.forEach { opt ->
            val item = TextView(this).apply {
                text = "${opt.flag}\n${opt.label}"
                textSize = 13f
                gravity = android.view.Gravity.CENTER
                setPadding(16, 8, 16, 8)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(opt.tag))
                }
            }
            row.addView(item)
        }
    }

    // ------------------------------------------------------------------
    // Réglages — statut + mises à jour
    // ------------------------------------------------------------------

    private fun refreshStatus() {
        val statusBanner = findViewById<TextView>(R.id.statusBanner)
        val isOwner = deviceOwnerManager.isDeviceOwner()
        statusBanner.text = if (isOwner) getString(R.string.status_owner) else getString(R.string.status_not_owner)
        if (isOwner) {
            statusBanner.setBackgroundResource(R.drawable.bg_status_success)
            statusBanner.setTextColor(getColor(R.color.status_success_text))
        } else {
            statusBanner.setBackgroundResource(R.drawable.bg_status_warning)
            statusBanner.setTextColor(getColor(R.color.status_warning_text))
        }
    }

    private fun onUpdatesClicked() {
        Toast.makeText(this, getString(R.string.settings_checking), Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            val update = updateManager.checkForUpdate()
            if (update == null) {
                Toast.makeText(this@MainActivity, getString(R.string.settings_up_to_date), Toast.LENGTH_SHORT).show()
                return@launch
            }

            AlertDialog.Builder(this@MainActivity)
                .setTitle("Mise à jour ${update.versionName} disponible")
                .setMessage(update.changelog.ifBlank { "Nouvelle version disponible." })
                .setPositiveButton("Installer") { _, _ ->
                    lifecycleScope.launch {
                        Toast.makeText(this@MainActivity, "Installation…", Toast.LENGTH_SHORT).show()
                        val result = updateManager.installUpdate(update)
                        val message = when (result) {
                            is SilentInstaller.Result.Success -> "✅ Mise à jour installée."
                            is SilentInstaller.Result.Failure -> "❌ Échec : ${result.message}"
                        }
                        Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
                    }
                }
                .setNegativeButton("Plus tard", null)
                .show()
        }
    }

    // ------------------------------------------------------------------
    // À propos — version, contact, suppression du filtre
    // ------------------------------------------------------------------

    private fun setupVersionAndContact() {
        findViewById<TextView>(R.id.versionLabel).text =
            "${getString(R.string.about_version_label)} : ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})"
    }

    private fun onRemoveFilterClicked() {
        val view = layoutInflater.inflate(R.layout.dialog_unlock_code, null)
        val boxes = listOf(
            view.findViewById<EditText>(R.id.codeBox0),
            view.findViewById<EditText>(R.id.codeBox1),
            view.findViewById<EditText>(R.id.codeBox2),
            view.findViewById<EditText>(R.id.codeBox3),
            view.findViewById<EditText>(R.id.codeBox4),
            view.findViewById<EditText>(R.id.codeBox5)
        )

        // Avance automatiquement au champ suivant après chaque caractère,
        // et revient en arrière au backspace sur un champ vide.
        boxes.forEachIndexed { index, box ->
            box.addTextChangedListener(object : android.text.TextWatcher {
                override fun afterTextChanged(s: android.text.Editable?) {
                    if (!s.isNullOrEmpty() && index < boxes.size - 1) {
                        boxes[index + 1].requestFocus()
                    }
                }
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            })
            box.setOnKeyListener { _, keyCode, event ->
                if (keyCode == android.view.KeyEvent.KEYCODE_DEL && event.action == android.view.KeyEvent.ACTION_DOWN
                    && box.text.isEmpty() && index > 0
                ) {
                    boxes[index - 1].requestFocus()
                    boxes[index - 1].setText("")
                }
                false
            }
        }
        boxes.first().requestFocus()

        AlertDialog.Builder(this)
            .setTitle(getString(R.string.unlock_dialog_title))
            .setMessage(getString(R.string.unlock_dialog_message))
            .setView(view)
            .setPositiveButton(getString(R.string.about_remove_filter)) { _, _ ->
                val code = boxes.joinToString("") { it.text.toString() }
                if (unlockManager.verify(code)) {
                    removeFilterConfirmed()
                } else {
                    Toast.makeText(this, getString(R.string.unlock_invalid), Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun removeFilterConfirmed() {
        try {
            deviceOwnerManager.removeBaseRestrictions()
            deviceOwnerManager.dpm.clearDeviceOwnerApp(packageName)
            Toast.makeText(this, getString(R.string.unlock_success), Toast.LENGTH_LONG).show()
            refreshStatus()
        } catch (e: Exception) {
            Toast.makeText(this, "❌ Erreur : ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // ------------------------------------------------------------------
    // Import de la config poussée une fois par le Web ADB
    // ------------------------------------------------------------------

    private fun importWebAdbConfigIfPresent() {
        val configFile = File(getExternalFilesDir(null), "yidream_config.json")
        if (!configFile.exists()) return

        try {
            val json = JSONObject(configFile.readText())

            val extraPackages = mutableListOf<String>()
            json.optJSONArray("extra_packages")?.let {
                for (i in 0 until it.length()) extraPackages.add(it.getString(i))
            }

            if (deviceOwnerManager.isDeviceOwner()) {
                deviceOwnerManager.applyCategoryBlocking(
                    blockBrowsers = json.optBoolean("block_browsers", false),
                    blockAi = json.optBoolean("block_ai", false),
                    blockSocial = json.optBoolean("block_social", false),
                    blockStore = json.optBoolean("block_store", false),
                    extraPackages = extraPackages
                )
                deviceOwnerManager.applyBaseRestrictions()
            }

            json.optString("unlock_intermediate_key", null)?.let {
                if (it.isNotBlank()) unlockManager.storeIntermediateKey(it)
            }

            refreshStatus()
            Toast.makeText(this, "Configuration importée et appliquée.", Toast.LENGTH_LONG).show()
            configFile.delete()
        } catch (e: Exception) {
            Toast.makeText(this, "Config invalide, ignorée.", Toast.LENGTH_SHORT).show()
        }
    }
}
