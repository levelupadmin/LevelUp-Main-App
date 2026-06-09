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
}
