package com.yidream.mdm

import android.content.pm.PackageManager
import android.os.Build
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Catalog installation and update actions share the same verified APK installer. */
internal class CatalogScreenController(private val activity: AppCompatActivity, private val service: MdmService) {
    private val container get() = activity.findViewById<LinearLayout>(R.id.storeContent)
    private var generation = 0
    private var installing = false
    private fun text(id: Int) = activity.getString(id)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun label(parent: LinearLayout, value: String, size: Float = 14f): TextView = TextView(activity).also {
        it.text = value; it.textSize = size; it.setTextColor(activity.getColor(R.color.accent_navy))
        parent.addView(it, LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(9) })
    }
    private fun card(): LinearLayout = LinearLayout(activity).apply {
        orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(20),dp(20),dp(18));setBackgroundResource(R.drawable.bg_quick_action)
        container.addView(this,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(14) })
    }
    private fun action(parent: LinearLayout, title: String, enabled: Boolean = true, run: (Button) -> Unit): Button = Button(activity).also {
        it.text=title;it.isAllCaps=false;it.isEnabled=enabled;it.minHeight=dp(48)
        parent.addView(it,LinearLayout.LayoutParams(-1,-2));it.setOnClickListener { _ -> run(it) }
    }
    private fun installedVersion(pkg: String): Long? = try {
        @Suppress("DEPRECATION") val info=activity.packageManager.getPackageInfo(pkg,0)
        if(Build.VERSION.SDK_INT>=28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    } catch (_: PackageManager.NameNotFoundException) { null }
    private fun installedName(pkg: String, fallback: Long): String = try {
        @Suppress("DEPRECATION") val info=activity.packageManager.getPackageInfo(pkg,0)
        info.versionName ?: fallback.toString()
    } catch (_: PackageManager.NameNotFoundException) { fallback.toString() }
    private fun ready(app: JSONObject) = CatalogUpdatePolicy.isReady(app.optString("apk_url"),app.optString("sha256"),app.optLong("version_code"))
    private fun needsUpdate(app: JSONObject) = app.getString("package_name") != activity.packageName && CatalogUpdatePolicy.shouldUpdate(installedVersion(app.getString("package_name")),app.optLong("version_code"))
    private fun baseMissing(app: JSONObject) = app.optBoolean("is_base") && installedVersion(app.getString("package_name"))==null && ready(app)
    fun load(onPair: () -> Unit) {
        val request=++generation;container.removeAllViews()
        val intro=card();label(intro,text(R.string.mdm_catalog_description))
        if(!service.paired){label(intro,text(R.string.mdm_pair_description));action(intro,text(R.string.mdm_pair)){onPair()};return}
        val owner=DeviceOwnerManager(activity).isDeviceOwner()
        if(!owner)label(intro,text(R.string.mdm_owner_required))
        val state=label(intro,text(R.string.mdm_loading))
        activity.lifecycleScope.launch {
            try {
                val response=service.catalog();if(request!=generation)return@launch
                intro.removeView(state)
                val apps=(0 until response.length()).map { response.getJSONObject(it) }
                val updates=apps.filter { ready(it) && needsUpdate(it) }
                val missing=apps.filter { baseMissing(it) }
                if(updates.isNotEmpty())action(intro,text(R.string.store_update_all)+" (${updates.size})",owner&&!installing){b->batch(updates,b)}
                if(missing.isNotEmpty())action(intro,text(R.string.store_install_base)+" (${missing.size})",owner&&!installing){b->batch(missing,b)}
                if(apps.isEmpty())label(intro,text(R.string.mdm_empty_catalog))
                else if(updates.isEmpty())label(intro,text(R.string.store_no_updates))
                for(app in apps){
                    val box=card();val pkg=app.getString("package_name");val installed=installedVersion(pkg);val available=app.optLong("version_code")
                    label(box,app.getString("name"),20f)
                    if(app.optBoolean("is_base"))label(box,text(R.string.store_base_badge),12f)
                    if(app.optString("description").isNotBlank())label(box,app.optString("description"))
                    val versionName=app.optString("version_name").takeUnless { it.isBlank() || it=="null" }?:available.toString()
                    label(box,if(installed==null)text(R.string.store_not_installed) else activity.getString(R.string.store_installed_version,installedName(pkg, installed)),12f)
                    if(available>0L)label(box,activity.getString(R.string.store_available_version,versionName),12f)
                    when {
                        !ready(app)->label(box,text(R.string.store_apk_missing))
                        installed==null->action(box,text(R.string.mdm_install),owner&&!installing){b->batch(listOf(app),b)}
                        needsUpdate(app)->action(box,text(R.string.store_update),owner&&!installing){b->batch(listOf(app),b)}
                        else->{label(box,text(R.string.settings_up_to_date));val intent=activity.packageManager.getLaunchIntentForPackage(pkg);if(intent!=null)action(box,text(R.string.store_open)){activity.startActivity(intent)}}
                    }
                }
            } catch (error: Exception) {
                if(request==generation)state.text=text(if(error.message=="SERVICE_NOT_READY")R.string.mdm_service_missing else R.string.mdm_network_error)
            }
            if(request==generation)action(card(),text(R.string.mdm_refresh),!installing){load(onPair)}
        }
    }
    private fun batch(apps: List<JSONObject>, button: Button){
        if(installing)return
        installing=true;button.isEnabled=false
        activity.lifecycleScope.launch {
            var succeeded=0;var failed=0
            try {
                for((index,app) in apps.withIndex()){
                    button.text=activity.getString(R.string.store_install_progress,index+1,apps.size,app.getString("name"))
                    val result=CatalogInstaller(activity).install(app)
                    if(result is SilentInstaller.Result.Success)succeeded++ else failed++
                }
                button.text=activity.getString(R.string.store_batch_result,succeeded,failed)
            }catch(_:Exception){button.text=text(R.string.mdm_install_failed)}
            finally { installing=false;button.isEnabled=true }
        }
    }
}
