import Foundation
import UIKit
import AVFoundation
import Capacitor
import VdoFramework

/// Thin full-screen container around the SDK's VdoPlayerViewController so we can
/// reliably detect dismissal (the SDK VC is vended by the framework and cannot be
/// subclassed) AND own the exit affordance.
///
/// The SDK's own close control is not reliably reachable in this fullscreen
/// presentation (testers reported "no way to get out of fullscreen"), so we
/// overlay our own always-visible close button pinned to the safe area, plus a
/// swipe-down-to-dismiss gesture (the standard iOS "drop the player" motion).
/// Either path calls dismiss(), which UIKit forwards here so viewDidDisappear
/// fires with isBeingDismissed == true.
final class VdoPlayerHostViewController: UIViewController {
    private let playerController: UIViewController
    var onClosed: (() -> Void)?
    private let closeButton = UIButton(type: .system)

    init(playerController: UIViewController) {
        self.playerController = playerController
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        addChild(playerController)
        playerController.view.frame = view.bounds
        playerController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(playerController.view)
        playerController.didMove(toParent: self)
        setupCloseAffordances()
    }

    private func setupCloseAffordances() {
        // Always-visible close: translucent dark disc + white X, pinned to the
        // safe-area top-left so it never hides under the notch / Dynamic Island
        // and always sits above the player view. This is the guaranteed exit.
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        let cfg = UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: cfg), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        closeButton.layer.cornerRadius = 19
        closeButton.layer.borderWidth = 0.5
        closeButton.layer.borderColor = UIColor.white.withAlphaComponent(0.18).cgColor
        closeButton.accessibilityLabel = "Close player"
        closeButton.addTarget(self, action: #selector(didTapClose), for: .touchUpInside)
        view.addSubview(closeButton)
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            closeButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            closeButton.widthAnchor.constraint(equalToConstant: 38),
            closeButton.heightAnchor.constraint(equalToConstant: 38),
        ])

        // Swipe-down-to-dismiss: the familiar iOS gesture for closing a video.
        let swipeDown = UISwipeGestureRecognizer(target: self, action: #selector(didTapClose))
        swipeDown.direction = .down
        swipeDown.delegate = self
        view.addGestureRecognizer(swipeDown)
    }

    @objc private func didTapClose() {
        dismiss(animated: true)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Keep the close button above the SDK player view if it re-layers.
        view.bringSubviewToFront(closeButton)
    }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Covered by another modal (e.g. the player's settings sheet): neither
        // condition is true, so no callback. Actually dismissed (directly or as
        // part of an ancestor dismissal): fire once.
        if isBeingDismissed || presentingViewController == nil {
            let callback = onClosed
            onClosed = nil
            callback?()
        }
    }
}

// MARK: - UIGestureRecognizerDelegate

extension VdoPlayerHostViewController: UIGestureRecognizerDelegate {
    // Let the swipe-down coexist with the SDK player's own gestures (scrubber,
    // tap-to-toggle-controls) instead of swallowing them.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        return true
    }
}

@objc(VdoPlayerPlugin)
public class VdoPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VdoPlayerPlugin"
    public let jsName = "VdoPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]

    private var asset: VdoAsset?
    private var pendingCall: CAPPluginCall?
    private var startPosition: Double?
    private weak var hostController: VdoPlayerHostViewController?

    // Progress reporting: the native fullscreen player has no iframe/postMessage,
    // so we observe the SDK's AVPlayer and emit periodic + final position to JS
    // (mirrors the web iframe's onProgress so iOS records watch progress too).
    private var timeObserverToken: Any?
    private weak var observedPlayer: AVPlayer?
    private var lastKnownSeconds: Double = 0
    private var lastKnownDuration: Double = 0

    /// play({ otp, playbackInfo, videoId, title? })
    /// Presents the VdoCipher native FairPlay player full-screen over the bridge
    /// view controller. Resolves once the player is presented; rejects with code
    /// PLAYBACK_ERROR on SDK errors. Emits "playerClosed" when the player is
    /// dismissed (user close or post-presentation load error).
    @objc func play(_ call: CAPPluginCall) {
        guard let otp = call.getString("otp"),
              let playbackInfo = call.getString("playbackInfo"),
              let videoId = call.getString("videoId") else {
            call.reject("otp, playbackInfo and videoId are required", "PLAYBACK_ERROR")
            return
        }

        if hostController != nil {
            call.reject("A player is already being presented", "PLAYBACK_ERROR")
            return
        }

        pendingCall = call
        startPosition = call.getDouble("startPosition")

        // Delegate must be set before playback starts so playerReadyToPlay /
        // streamLoadError reach us.
        VdoCipher.setPlaybackDelegate(delegate: self)

        VdoAsset.createAsset(videoId: videoId) { [weak self] asset, error in
            guard let self = self else { return }
            if let error = error {
                self.failPendingCall("VdoCipher asset creation failed: \(error)")
                return
            }
            guard let asset = asset else {
                self.failPendingCall("VdoCipher returned no asset for video \(videoId)")
                return
            }
            self.asset = asset
            DispatchQueue.main.async {
                self.presentPlayer(otp: otp, playbackInfo: playbackInfo)
            }
        }
    }

    private func presentPlayer(otp: String, playbackInfo: String) {
        guard let presenter = bridge?.viewController else {
            failPendingCall("No view controller available to present the player")
            return
        }

        configureAudioSession()

        let playerController = VdoCipher.getVdoPlayerViewController()
        let host = VdoPlayerHostViewController(playerController: playerController)
        host.onClosed = { [weak self] in
            self?.handlePlayerClosed()
        }
        hostController = host

        presenter.present(host, animated: true) { [weak self] in
            guard let self = self else { return }
            // OTP ttl is 300s — start playback immediately after presentation.
            self.asset?.playOnline(otp: otp, playbackInfo: playbackInfo)
            self.pendingCall?.resolve()
            self.pendingCall = nil
        }
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {
            CAPLog.print("VdoPlayer: could not activate AVAudioSession: \(error)")
        }
    }

    private func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            CAPLog.print("VdoPlayer: could not deactivate AVAudioSession: \(error)")
        }
    }

    private func failPendingCall(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.pendingCall?.reject(message, "PLAYBACK_ERROR")
            self.pendingCall = nil
            self.asset = nil
            self.startPosition = nil
        }
    }

    private func handlePlayerClosed(errorMessage: String? = nil) {
        removeTimeObserver()
        asset = nil
        startPosition = nil
        hostController = nil
        deactivateAudioSession()
        var data: [String: Any] = [:]
        if let errorMessage = errorMessage {
            data["error"] = errorMessage
        }
        // Final position so JS can persist completion/resume on dismissal.
        if lastKnownDuration > 0 {
            data["currentSeconds"] = lastKnownSeconds
            data["totalSeconds"] = lastKnownDuration
        }
        notifyListeners("playerClosed", data: data)
        lastKnownSeconds = 0
        lastKnownDuration = 0
    }

    /// Periodic position updates from the SDK's AVPlayer → "playerTimeUpdate".
    private func attachTimeObserver(to player: AVPlayer) {
        removeTimeObserver()
        observedPlayer = player
        let interval = CMTime(seconds: 5, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self, weak player] time in
            guard let self = self, let player = player else { return }
            let current = time.seconds
            if current.isFinite { self.lastKnownSeconds = current }
            if let dur = player.currentItem?.duration.seconds, dur.isFinite, dur > 0 {
                self.lastKnownDuration = dur
            }
            guard self.lastKnownDuration > 0 else { return }
            self.notifyListeners("playerTimeUpdate", data: [
                "currentSeconds": self.lastKnownSeconds,
                "totalSeconds": self.lastKnownDuration,
            ])
        }
    }

    private func removeTimeObserver() {
        if let token = timeObserverToken {
            observedPlayer?.removeTimeObserver(token)
        }
        timeObserverToken = nil
        observedPlayer = nil
    }
}

// MARK: - AssetPlaybackDelegate

extension VdoPlayerPlugin: AssetPlaybackDelegate {
    public func streamPlaybackManager(playerReadyToPlay player: AVPlayer) {
        // Start emitting progress to JS for the whole playback session.
        attachTimeObserver(to: player)
        // Resume parity with the web iframe's `&t=` param.
        if let position = startPosition, position > 0 {
            startPosition = nil
            let target = CMTime(seconds: position, preferredTimescale: 600)
            player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .positiveInfinity) { _ in
                player.play()
            }
        } else {
            player.play()
        }
    }

    public func streamPlaybackManager(playerCurrentItemDidChange player: AVPlayer) {
        // The built-in VdoPlayerViewController wires its own AVPlayer; nothing to do.
    }

    public func streamLoadError(error: VdoError) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let message = "VdoCipher playback failed: \(error)"
            if self.pendingCall != nil {
                // Failed before the player was presented — reject the JS promise.
                self.pendingCall?.reject(message, "PLAYBACK_ERROR")
                self.pendingCall = nil
                self.asset = nil
                if let host = self.hostController {
                    host.onClosed = nil
                    self.hostController = nil
                    host.dismiss(animated: true)
                }
                return
            }
            // Failed after presentation — tear down and tell JS via playerClosed.
            if let host = self.hostController {
                host.onClosed = nil
                host.dismiss(animated: true) { [weak self] in
                    self?.handlePlayerClosed(errorMessage: message)
                }
            } else {
                self.handlePlayerClosed(errorMessage: message)
            }
        }
    }
}
