package com.yidream.mdm
import org.junit.Assert.*
import org.junit.Test
class CatalogUpdatePolicyTest {
 @Test fun updatesOnlyInstalledOlderVersions(){assertTrue(CatalogUpdatePolicy.shouldUpdate(1L,2L));assertFalse(CatalogUpdatePolicy.shouldUpdate(2L,2L));assertFalse(CatalogUpdatePolicy.shouldUpdate(3L,2L));assertFalse(CatalogUpdatePolicy.shouldUpdate(null,2L));assertFalse(CatalogUpdatePolicy.shouldUpdate(1L,0L))}
 @Test fun requiresVerifiedVersionedHttpsRelease(){assertTrue(CatalogUpdatePolicy.isReady("https://example.org/app.apk","a".repeat(64),2L));assertFalse(CatalogUpdatePolicy.isReady("http://example.org/app.apk","a".repeat(64),2L));assertFalse(CatalogUpdatePolicy.isReady("https://example.org/app.apk","",2L));assertFalse(CatalogUpdatePolicy.isReady("https://example.org/app.apk","a".repeat(64),0L))}
}
