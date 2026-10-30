package com.yidream.mdm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap

internal object CatalogInstallSessions {
    val pending = ConcurrentHashMap<Int, CompletableDeferred<SilentInstaller.Result>>()
}

class CatalogInstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val result = if (status == PackageInstaller.STATUS_SUCCESS) SilentInstaller.Result.Success
        else SilentInstaller.Result.Failure(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Installation refusée par Android.")
        CatalogInstallSessions.pending.remove(id)?.complete(result)
    }
}
