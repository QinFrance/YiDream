package com.yidream.mdm

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class LauncherActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var titleTaps = 0
    private var lastTitleTap = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(16, 16, 20)
        window.navigationBarColor = Color.rgb(16, 16, 20)
        window.decorView.systemUiVisibility = 0

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.rgb(16, 16, 20))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean = true
            }
            addJavascriptInterface(LauncherBridge(), "YiDream")
        }
        setContentView(webView)
        supportActionBar?.hide()
        val html = assets.open("launcher.html").bufferedReader().use { it.readText() }
        webView.loadDataWithBaseURL("https://yidream.local/", html, "text/html", "UTF-8", null)
    }

    override fun onResume() {
        super.onResume()
        applyDedicatedPolicyIfAvailable()
    }

    private fun applyDedicatedPolicyIfAvailable() {
        val owner = DeviceOwnerManager(this)
        if (!owner.isDeviceOwner()) return
        owner.configureDedicatedLauncher(LauncherActivity::class.java)
        try {
            startLockTask()
        } catch (_: Exception) {
            Toast.makeText(this, "Le mode appareil dédié n’a pas pu être activé.", Toast.LENGTH_LONG).show()
        }
    }

    private inner class LauncherBridge {
        @JavascriptInterface
        fun openApp(name: String) {
            runOnUiThread {
                val packageName = when (name.lowercase()) {
                    "zemer" -> "com.jtech.zemer"
                    "waze" -> "com.waze"
                    "pulsar" -> "com.rhmsoft.pulsar"
                    else -> null
                }
                val intent = packageName?.let { packageManager.getLaunchIntentForPackage(it) }
                if (intent == null) {
                    Toast.makeText(this@LauncherActivity, "$name n’est pas installé. Utilise YiDream Suite pour l’ajouter.", Toast.LENGTH_LONG).show()
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                }
            }
        }

        @JavascriptInterface
        fun openBluetooth() {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
                } catch (_: Exception) {
                    startActivity(Intent(Settings.ACTION_SETTINGS))
                }
            }
        }

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_SETTINGS))
                } catch (_: Exception) {
                    Toast.makeText(this@LauncherActivity, "Réglages indisponibles sur cet appareil.", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun titleTap() {
            runOnUiThread {
                val now = System.currentTimeMillis()
                titleTaps = if (now - lastTitleTap > 1800) 1 else titleTaps + 1
                lastTitleTap = now
                if (titleTaps >= 7) {
                    titleTaps = 0
                    startActivity(Intent(this@LauncherActivity, MainActivity::class.java))
                }
            }
        }
    }
}
