package com.yidream.mdm

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/**
 * Receiver obligatoire pour qu'Android reconnaisse l'app comme Device Admin / Device Owner.
 * onDisableRequested() est appelé quand quelqu'un essaie de désactiver l'admin depuis
 * les paramètres : on ne peut pas l'empêcher techniquement à ce stade (Android l'autorise
 * toujours), mais tant que l'app est Device Owner, l'option de désinstallation/désactivation
 * est de toute façon masquée par les restrictions posées dans DeviceOwnerManager.
 */
class MyDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "YiDream activé", Toast.LENGTH_SHORT).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        return "Désactiver YiDream supprimera toutes les restrictions appliquées."
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Toast.makeText(context, "YiDream désactivé", Toast.LENGTH_SHORT).show()
    }
}
