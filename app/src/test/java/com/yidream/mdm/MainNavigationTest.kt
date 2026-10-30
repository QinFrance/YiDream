package com.yidream.mdm
import org.junit.Assert.assertEquals
import org.junit.Test
class MainNavigationTest {
    @Test fun redirectsOldAboutTabToSettings() { assertEquals("settings", MainNavigation.restore("about")) }
    @Test fun restoresEachMainTab() { listOf("home","store","sites","settings").forEach { assertEquals(it, MainNavigation.restore(it)) } }
    @Test fun invalidStateOpensHome() { assertEquals("home",MainNavigation.restore(null));assertEquals("home",MainNavigation.restore("unknown")) }
}
