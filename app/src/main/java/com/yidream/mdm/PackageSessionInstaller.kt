package com.yidream.mdm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeout
import java.io.File

/** Used for both catalog apps and YiDream itself: a commit is not an install success. */
internal class PackageSessionInstaller(private val context: Context) {
    suspend fun install(file: File): SilentInstaller.Result {
        val installer=context.packageManager.packageInstaller
        var sessionId=-1
        var submitted=false
        try {
            val params=PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setInstallReason(PackageManager.INSTALL_REASON_POLICY)
            sessionId=installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                session.openWrite("yidream_verified_apk",0,file.length()).use { output ->
                    file.inputStream().use { it.copyTo(output) };session.fsync(output)
                }
                val callback=Intent(context,CatalogInstallResultReceiver::class.java)
                    .putExtra(PackageInstaller.EXTRA_SESSION_ID,sessionId)
                val pending=PendingIntent.getBroadcast(context,sessionId,callback,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
                val completion=CompletableDeferred<SilentInstaller.Result>()
                CatalogInstallSessions.pending[sessionId]=completion
                session.commit(pending.intentSender)
                submitted=true
                return withTimeout(120_000L) { completion.await() }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { return SilentInstaller.Result.Failure(error.message ?: "Installation refusée par Android.") }
        finally {
            CatalogInstallSessions.pending.remove(sessionId)
            if(sessionId>=0&&!submitted)runCatching { installer.abandonSession(sessionId) }
        }
    }
}
