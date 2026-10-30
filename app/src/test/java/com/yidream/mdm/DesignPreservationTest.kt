package com.yidream.mdm

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode
import java.io.File

/**
 * Draws the real Android layouts and native catalog cards, with local fixture data only.
 * No pairing credential is installed, no Supabase request is sent, and no install,
 * website-request or filter-removal action is submitted by these tests.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
class DesignPreservationTest {
    private lateinit var controller: ActivityController<MainActivity>
    private lateinit var activity: MainActivity
    private val pages = linkedMapOf(
        R.id.tabHome to R.id.pageHome,
        R.id.tabStore to R.id.pageStore,
        R.id.tabSites to R.id.pageSites,
        R.id.tabSettings to R.id.pageSettings
    )

    @Before
    fun launchWithoutAnyRealDeviceCredential() {
        val app = RuntimeEnvironment.getApplication()
        app.getSharedPreferences("yidream_device_portal", Context.MODE_PRIVATE).edit().clear().commit()
        controller = Robolectric.buildActivity(MainActivity::class.java).create().start().resume().visible()
        activity = controller.get()
        shadowOf(Looper.getMainLooper()).idle()
        assertFalse(MdmService(activity).paired)
    }

    @After
    fun closeActivity() {
        if (::controller.isInitialized) controller.pause().stop().destroy()
    }

    @Test
    fun allScreensAndExistingActionsRemainAccessibleAndHaveNativePreviews() {
        layout(360, 800)
        assertPage(R.id.pageHome)
        listOf(R.id.homeOpenStore, R.id.homeOpenSites, R.id.homeOpenSettings).forEach(::assertAction)
        assertNotNull(activity.findViewById<TextView>(R.id.homeStatus))
        capture("home", 360, 800)

        select(R.id.tabStore, R.id.pageStore)
        showCatalogFixtures()
        layout(360, 800)
        val install = buttons().firstOrNull { it.text.toString() == activity.getString(R.string.mdm_install) }
        assertNotNull("A ready app still exposes the Installer action", install)
        assertTrue("The visual installer fixture is enabled", install!!.isEnabled)
        assertTrue("The actual catalog card keeps the install listener", install.hasOnClickListeners())
        assertTrue(texts().any { it.text.toString() == activity.getString(R.string.store_apk_missing) })
        capture("store", 360, 800)

        select(R.id.tabSites, R.id.pageSites)
        // The real unpaired screen must still offer its existing association action.
        assertTrue(buttons().any { it.text.toString() == activity.getString(R.string.mdm_pair) })
        capture("sites", 360, 800)
        showWebsiteStatusFixtures()
        capture("sites-requests", 360, 800)

        select(R.id.tabSettings, R.id.pageSettings)
        val languages = activity.findViewById<LinearLayout>(R.id.languageRow)
        assertEquals("All four language choices remain available", 4, languages.childCount)
        (0 until languages.childCount).forEach { assertTrue(languages.getChildAt(it).hasOnClickListeners()) }
        listOf(R.id.rowUpdates, R.id.rowPairDevice, R.id.rowRemoveFilter).forEach(::assertAction)
        val about = activity.findViewById<ViewGroup>(R.id.sectionAbout)
        listOf(R.id.versionLabel, R.id.contactLabel, R.id.rowRemoveFilter).forEach { id ->
            assertNotNull("About action or detail remains inside Settings", about.findViewById<View>(id))
        }
        assertTrue(activity.findViewById<TextView>(R.id.versionLabel).text.contains(BuildConfig.VERSION_NAME))
        capture("settings", 360, 800)
        val settings = activity.findViewById<ScrollView>(R.id.pageSettings)
        settings.fullScroll(View.FOCUS_DOWN)
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(activity.findViewById<View>(R.id.rowRemoveFilter).getGlobalVisibleRect(Rect()))
        capture("settings-about", 360, 800)

        // Exercise the three real Home shortcuts, without invoking a remote action.
        select(R.id.tabHome, R.id.pageHome)
        activity.findViewById<View>(R.id.homeOpenStore).performClick()
        assertPage(R.id.pageStore)
        select(R.id.tabHome, R.id.pageHome)
        activity.findViewById<View>(R.id.homeOpenSites).performClick()
        assertPage(R.id.pageSites)
        select(R.id.tabHome, R.id.pageHome)
        activity.findViewById<View>(R.id.homeOpenSettings).performClick()
        assertPage(R.id.pageSettings)
        assertFalse("Preview navigation must never pair a real device", MdmService(activity).paired)
    }

    @Test
    @Config(qualifiers = "fr-w320dp-h568dp-xhdpi")
    fun narrowScreenKeepsNavigationAndPrimaryInstallActionReachable() {
        layout(320, 568)
        pages.keys.forEach { tab -> assertFullyVisible(activity.findViewById(tab), 320) }
        select(R.id.tabStore, R.id.pageStore)
        showCatalogFixtures()
        layout(320, 568)
        val install = buttons().first { it.text.toString() == activity.getString(R.string.mdm_install) }
        assertFullyVisible(install, 320)
        assertTrue("Installer keeps a touch target of at least 48 dp", install.height >= dp(48))
        capture("store-narrow", 320, 568)

        // Inflate the real unlock form without opening or submitting filter removal.
        val unlock = activity.layoutInflater.inflate(R.layout.dialog_unlock_code, null)
        unlock.measure(View.MeasureSpec.makeMeasureSpec(dp(272), View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dp(120), View.MeasureSpec.AT_MOST))
        unlock.layout(0, 0, unlock.measuredWidth, unlock.measuredHeight)
        listOf(R.id.codeBox0, R.id.codeBox1, R.id.codeBox2, R.id.codeBox3, R.id.codeBox4, R.id.codeBox5).forEach { id ->
            val box = unlock.findViewById<EditText>(id)
            assertTrue("All six code fields fit the narrow dialog", box.left >= 0 && box.right <= unlock.measuredWidth)
            assertTrue(box.width > 0)
        }
    }

    @Test
    @Config(qualifiers = "he-ldrtl-w320dp-h640dp-xhdpi")
    fun rtlScreenKeepsFourTabsAndTheNativeCatalogLayout() {
        layout(320, 640)
        assertEquals(View.LAYOUT_DIRECTION_RTL, activity.findViewById<View>(R.id.pageHome).layoutDirection)
        pages.keys.forEach { tab -> assertFullyVisible(activity.findViewById(tab), 320) }
        capture("home-rtl", 320, 640)
        select(R.id.tabStore, R.id.pageStore)
        showCatalogFixtures()
        capture("store-rtl", 320, 640)
    }

    private fun select(tab: Int, page: Int) {
        assertTrue(activity.findViewById<View>(tab).performClick())
        shadowOf(Looper.getMainLooper()).idle()
        assertPage(page)
    }

    private fun assertPage(expected: Int) {
        pages.values.forEach { page ->
            assertEquals("Exactly the requested screen is visible", if (page == expected) View.VISIBLE else View.GONE,
                activity.findViewById<View>(page).visibility)
        }
    }

    private fun assertAction(id: Int) {
        val view = activity.findViewById<View>(id)
        assertNotNull(view)
        assertTrue("Existing action ${activity.resources.getResourceEntryName(id)} keeps its listener", view.hasOnClickListeners())
    }

    private fun showCatalogFixtures() {
        val content = activity.findViewById<LinearLayout>(R.id.storeContent)
        content.removeAllViews()
        val catalog = CatalogScreenController(activity, MdmService(activity))
        fun app(name: String, pkg: String, description: String, ready: Boolean) = JSONObject()
            .put("name", name).put("package_name", pkg).put("description", description)
            .put("is_base", true).put("version_name", "2.24.1").put("version_code", 22401L)
            .put("apk_url", if (ready) "https://example.invalid/$pkg.apk" else JSONObject.NULL)
            .put("sha256", if (ready) "a".repeat(64) else JSONObject.NULL)
        catalog.renderAppCard(app("WhatsApp", "com.whatsapp", "Messagerie et appels, au quotidien.", true), true)
        catalog.renderAppCard(app("Waze", "com.waze", "Navigation et itinéraires.", true), true)
        catalog.renderAppCard(app("CalJ", "net.calj.android", "Calendrier juif, fêtes et horaires.", false), true)
    }

    private fun showWebsiteStatusFixtures() {
        val content = activity.findViewById<LinearLayout>(R.id.sitesContent)
        // Keep the real page title and explanation. Replace only the unpaired fixture
        // controls with local request cards, without creating a device token.
        while (content.childCount > 2) content.removeViewAt(content.childCount - 1)
        val portal = MdmPortalController(activity)
        listOf("pending" to R.string.mdm_pending, "approved" to R.string.mdm_approved,
            "rejected" to R.string.mdm_rejected, "revoked" to R.string.mdm_revoked).forEach { (status, label) ->
            portal.renderSiteRequest(JSONObject().put("site_url", "https://$status.example.org/")
                .put("status", status).put("admin_note", "Réponse de démonstration de l’administrateur."), activity.getString(label))
            assertTrue(texts().any { it.text.toString() == activity.getString(label) })
        }
        assertTrue(texts().any { it.text.toString().contains("Réponse de démonstration") })
        assertFalse(MdmService(activity).paired)
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    private fun content() = activity.findViewById<ViewGroup>(android.R.id.content)

    private fun layout(widthDp: Int, heightDp: Int) {
        val root = content()
        root.measure(View.MeasureSpec.makeMeasureSpec(dp(widthDp), View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dp(heightDp), View.MeasureSpec.EXACTLY))
        root.layout(0, 0, dp(widthDp), dp(heightDp))
    }

    private fun descendants(root: View = content()): List<View> = buildList {
        add(root)
        if (root is ViewGroup) (0 until root.childCount).forEach { addAll(descendants(root.getChildAt(it))) }
    }

    private fun buttons() = descendants().filterIsInstance<Button>()
    private fun texts() = descendants().filterIsInstance<TextView>()

    private fun assertFullyVisible(view: View, viewportWidthDp: Int) {
        val bounds = Rect()
        assertTrue("Action must remain visible", view.getGlobalVisibleRect(bounds))
        assertEquals("The complete action remains inside the visible viewport", view.width, bounds.width())
        assertTrue(bounds.width() <= dp(viewportWidthDp))
    }

    private fun capture(name: String, widthDp: Int, heightDp: Int) {
        layout(widthDp, heightDp)
        val bitmap = Bitmap.createBitmap(dp(widthDp), dp(heightDp), Bitmap.Config.ARGB_8888)
        content().draw(Canvas(bitmap))
        val directory = File(System.getProperty("yidream.uiPreviewDir", "build/ui-previews")).apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        File(directory, "README.txt").writeText(
            "Native Robolectric rendering of the real YiDream Android views. " +
            "Catalog cards use demonstration metadata only; no APK was downloaded or installed, " +
            "no website request was submitted, and no Supabase or real device pairing was used.\n")
        bitmap.recycle()
    }
}
