package com.yidream.mdm

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Vérifie et installe les mises à jour de YiDream lui-même — SILENCIEUSEMENT,
 * via SilentInstaller (capacité Device Owner confirmée, aucune confirmation
 * utilisateur requise, contrairement à ce qu'on pensait au début du projet).
 *
 * Format attendu à MANIFEST_URL (JSON hébergé sur ton propre serveur) :
 * {
 *   "versionCode": 2,
 *   "versionName": "v2",
 *   "apkUrl": "https://.../yidream-v2.apk",
 *   "changelog": "Corrections de bugs"
 * }
 */
class UpdateManager(private val context: Context) {

    data class UpdateInfo(
        val versionCode: Int,
        val versionName: String,
        val apkUrl: String,
        val changelog: String
    )

    companion object {
        // À adapter : URL de ton fichier version.json (voir VERSIONING.md)
        const val MANIFEST_URL = "https://yidream-tonpseudo.duckdns.org/yidream/version.json"
    }

    private val silentInstaller = SilentInstaller(context)

    suspend fun checkForUpdate(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val connection = URL(MANIFEST_URL).openConnection() as HttpURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            val body = connection.inputStream.bufferedReader().readText()
            connection.disconnect()

            val json = JSONObject(body)
            val remoteVersionCode = json.getInt("versionCode")
            val currentVersionCode = context.packageManager
                .getPackageInfo(context.packageName, 0).let {
                    if (android.os.Build.VERSION.SDK_INT >= 28) it.longVersionCode.toInt()
                    else @Suppress("DEPRECATION") it.versionCode
                }

            if (remoteVersionCode > currentVersionCode) {
                UpdateInfo(
                    versionCode = remoteVersionCode,
                    versionName = json.getString("versionName"),
                    apkUrl = json.getString("apkUrl"),
                    changelog = json.optString("changelog", "")
                )
            } else null
        } catch (e: Exception) {
            null
        }
    }

    suspend fun installUpdate(update: UpdateInfo): SilentInstaller.Result {
        return silentInstaller.downloadAndInstall(update.apkUrl)
    }
}
