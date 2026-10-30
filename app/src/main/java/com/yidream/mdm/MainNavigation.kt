package com.yidream.mdm

internal object MainNavigation {
    private val tabs = setOf("home", "store", "sites", "settings")
    fun restore(key: String?): String = when {
        key == "about" -> "settings"
        key in tabs -> key!!
        else -> "home"
    }
}
