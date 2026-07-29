import { describe, expect, it } from "vitest";
import { inspectAndroidManifest, inspectAndroidSource } from "./android.js";

describe("Android security baseline", () => {
  it("finds insecure release manifest settings", () => {
    const findings = inspectAndroidManifest(`
      <manifest>
        <application android:debuggable="true" android:usesCleartextTraffic="true">
          <activity android:name=".MainActivity" android:exported="true" />
        </application>
      </manifest>
    `);
    expect(findings.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining([
        "ANDROID-DEBUGGABLE",
        "ANDROID-CLEARTEXT",
        "ANDROID-EXPORTED-COMPONENT",
        "ANDROID-BACKUP",
      ]),
    );
  });

  it("blocks TLS bypass and flags dangerous WebView configuration", () => {
    const findings = inspectAndroidSource(`
      override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.proceed()
      }
      webView.settings.setAllowUniversalAccessFromFileURLs(true)
    `);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "ANDROID-TLS-PROCEED", severity: "CRITICAL" }),
        expect.objectContaining({ ruleId: "ANDROID-WEBVIEW-UNIVERSAL-FILE", severity: "HIGH" }),
      ]),
    );
  });
});
