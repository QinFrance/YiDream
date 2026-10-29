package com.yidream.mdm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MdmSiteAddressTest {
    @Test fun addsHttpsAndNormalizesHost() {
        assertEquals("https://example.com/", MdmService.normalizeSite(" EXAMPLE.com "))
        assertEquals("https://example.com/path?q=1", MdmService.normalizeSite("https://EXAMPLE.com/path?q=1#section"))
    }
    @Test fun rejectsCredentialsUnsafeSchemesAndInvalidHosts() {
        listOf("", "http://example.com", "javascript:alert(1)", "https://user:password@example.com",
            "https://localhost", "https://example.com:8443", "https://exam ple.com").forEach { value ->
            assertThrows(Exception::class.java) { MdmService.normalizeSite(value) }
        }
    }
    @Test fun rejectsExcessiveLength() {
        assertThrows(Exception::class.java) { MdmService.normalizeSite("https://example.com/" + "a".repeat(2048)) }
    }
}
