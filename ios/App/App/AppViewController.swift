import UIKit
import Capacitor

/// Custom bridge view controller so locally-defined Capacitor plugins can be
/// registered. `npx cap sync ios` regenerates capacitor.config.json's
/// packageClassList from node_modules only, so app-target plugins MUST be
/// registered here (this file and the storyboard reference survive sync).
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VdoPlayerPlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        // Native iOS edge-swipe-back. The app routes with React Router's
        // BrowserRouter (HTML5 History API), so the WKWebView keeps a real
        // back/forward list — enabling this gives the system's interactive
        // peel gesture from the left edge across the ENTIRE app, and UIKit
        // drives the SPA back-navigation via popstate. No per-screen wiring.
        webView?.allowsBackForwardNavigationGestures = true
    }
}
