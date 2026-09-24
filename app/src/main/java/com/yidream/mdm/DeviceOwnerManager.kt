package com.yidream.mdm

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager

class DeviceOwnerManager(private val context: Context) {

    val dpm: DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    val adminComponent = ComponentName(context, MyDeviceAdminReceiver::class.java)

    fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)

    // ---------------------------------------------------------------
    // Listes d'apps par catégorie. WhatsApp/messagerie n'est PAS dans
    // cette liste : décision explicite de ne pas restreindre cette
    // catégorie (le blocage fin de fonctionnalités internes à une app
    // tierce comme WhatsApp n'est techniquement pas possible via les
    // API Android de gestion d'appareil).
    // ---------------------------------------------------------------

    val knownBrowsers = listOf(
        "com.android.chrome", "com.chrome.beta", "org.mozilla.firefox",
        "com.sec.android.app.sbrowser", "com.opera.browser", "com.opera.mini.native",
        "com.microsoft.emmx", "com.brave.browser", "com.duckduckgo.mobile.android",
        "com.UCMobile.intl", "com.kiwibrowser.browser", "com.vivaldi.browser",
        "com.android.browser"
    )

    val knownAiApps = listOf(
        "com.openai.chatgpt", "com.google.android.apps.bard", "com.google.android.apps.aichat",
        "com.microsoft.copilot", "com.anthropic.claude", "ai.perplexity.app.android",
        "com.deepseek.chat", "com.x.grok", "com.character.ai"
    )

    val knownSocial = listOf(
        "com.instagram.android", "com.zhiliaoapp.musically", "com.facebook.katana",
        "com.snapchat.android", "com.twitter.android", "com.reddit.frontpage"
    )

    val knownStores = listOf("com.android.vending")

    // ---------------------------------------------------------------
    // Blocage / déblocage d'une app (masquage : invisible et inutilisable,
    // sans désinstallation réelle qui n'est pas possible pour toutes les apps).
    // ---------------------------------------------------------------

    fun setAppBlocked(packageName: String, blocked: Boolean): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            dpm.setApplicationHidden(adminComponent, packageName, blocked)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun isAppBlocked(packageName: String): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            dpm.isApplicationHidden(adminComponent, packageName)
        } catch (e: Exception) {
            false
        }
    }

    fun applyCategoryBlocking(
        blockBrowsers: Boolean,
        blockAi: Boolean,
        blockSocial: Boolean,
        blockStore: Boolean,
        extraPackages: List<String> = emptyList()
    ) {
        if (!isDeviceOwner()) return
        if (blockBrowsers) knownBrowsers.forEach { setAppBlocked(it, true) }
        if (blockAi) knownAiApps.forEach { setAppBlocked(it, true) }
        if (blockSocial) knownSocial.forEach { setAppBlocked(it, true) }
        if (blockStore) knownStores.forEach { setAppBlocked(it, true) }
        extraPackages.forEach { setAppBlocked(it, true) }
    }

    // ---------------------------------------------------------------
    // Restrictions globales de l'appareil.
    // ---------------------------------------------------------------

    private val allRestrictions = listOf(
        UserManager.DISALLOW_ADD_USER,
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_INSTALL_APPS,
        UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
        UserManager.DISALLOW_UNINSTALL_APPS,
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_CONFIG_DATE_TIME
        // DISALLOW_DEBUGGING_FEATURES est volontairement absent de cette liste.
        // La bloquer empêchait de manière intermittente le Web ADB de se
        // reconnecter au téléphone pour retirer les restrictions en cas de
        // besoin (le seul canal de secours en dehors du code de
        // déverrouillage sur l'appareil). Le compromis : quelqu'un de
        // techniquement averti pourrait rebasculer le débogage USB — mais
        // la suppression du filtre reste de toute façon protégée par le
        // code du jour (voir UnlockManager), donc ce n'est pas une porte
        // dérobée en soi.
    )

    fun applyBaseRestrictions() {
        if (!isDeviceOwner()) return
        allRestrictions.forEach {
            try { dpm.addUserRestriction(adminComponent, it) } catch (e: Exception) { }
        }
        try {
            dpm.setSecureSetting(
                adminComponent,
                android.provider.Settings.Secure.INSTALL_NON_MARKET_APPS,
                "0"
            )
        } catch (e: Exception) { }
    }

    fun removeBaseRestrictions() {
        if (!isDeviceOwner()) return
        allRestrictions.forEach {
            try { dpm.clearUserRestriction(adminComponent, it) } catch (e: Exception) { }
        }
    }
}
