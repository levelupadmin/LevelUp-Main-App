package com.tagmango.leveluplearning;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * LevelUp Android shell.
 *
 * We extend the Capacitor default only to add HTML5 fullscreen video
 * support for the VdoCipher player. Everything else is inherited from
 * {@link BridgeWebChromeClient}:
 *
 *   - DRM (Widevine): the base onPermissionRequest() grants every
 *     resource that isn't camera/mic, which includes
 *     android.webkit.resource.PROTECTED_MEDIA_ID. So encrypted-media
 *     (EME) playback works without us touching it.
 *   - File chooser (assignment uploads): the base onShowFileChooser()
 *     already wires <input type="file"> to the system picker.
 *
 * The one thing the base client deliberately breaks is fullscreen:
 * its onShowCustomView() immediately calls callback.onCustomViewHidden(),
 * cancelling the request. That makes the player's fullscreen button a
 * no-op. The subclass below implements the standard custom-view dance
 * (add the video view to the window decor, hide system UI, rotate to
 * landscape) and reverses it on exit.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // FLAG_SECURE: block screenshots and make screen recordings capture
        // black, app-wide. WebView plays Widevine at L3 (software decrypt),
        // which does NOT enforce a secure output path — so without this flag
        // testers could screen-record DRM masterclass video. App-wide is the
        // Netflix/Hotstar approach and avoids racy per-screen toggling. The
        // share sheet (invoices) is unaffected — it shares files, not pixels.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Swap in our fullscreen-aware chrome client. Done here in
        // onCreate (the activity is CREATED, not yet STARTED) so the
        // ActivityResultLaunchers registered inside the
        // BridgeWebChromeClient constructor register legally — AndroidX
        // forbids registerForActivityResult() after onStart().
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new FullscreenAwareChromeClient(bridge));
        }
    }

    /**
     * Adds real HTML5 fullscreen support on top of Capacitor's chrome
     * client. Non-static so it can reach the Activity's window +
     * orientation. Note we intentionally do NOT call super in
     * onShowCustomView/onHideCustomView — the base versions cancel
     * fullscreen, which is exactly what we're replacing.
     */
    private class FullscreenAwareChromeClient extends BridgeWebChromeClient {
        private View customView;
        private CustomViewCallback customViewCallback;
        private int savedOrientation;
        private int savedSystemUi;

        FullscreenAwareChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            // Only one fullscreen view at a time.
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            savedSystemUi = getWindow().getDecorView().getSystemUiVisibility();
            savedOrientation = getRequestedOrientation();
            customViewCallback = callback;

            ((FrameLayout) getWindow().getDecorView()).addView(
                customView,
                new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            );

            // Immersive: hide status + nav bars so the video owns the screen.
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );

            // 16:9 video reads far better in landscape; sensor lets the
            // user pick which way to tilt. Restored on exit.
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) {
                return;
            }
            ((FrameLayout) getWindow().getDecorView()).removeView(customView);
            customView = null;
            getWindow().getDecorView().setSystemUiVisibility(savedSystemUi);
            setRequestedOrientation(savedOrientation);
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
        }
    }
}
