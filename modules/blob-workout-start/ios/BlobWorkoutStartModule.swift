import ExpoModulesCore
import HealthKit
import SwiftUI
import WatchConnectivity

#if canImport(WorkoutKit)
import WorkoutKit
#endif

public class BlobWorkoutStartModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BlobWorkoutStart")

    AsyncFunction("getAvailability") { () -> [String: Any] in
      #if targetEnvironment(simulator)
      return [
        "available": false,
        "simulator": true,
        "watchPaired": false,
        "workoutKit": false,
      ]
      #else
      let health = HKHealthStore.isHealthDataAvailable()
      var canTellPaired = false
      var paired = false
      if WCSession.isSupported() {
        canTellPaired = true
        let session = WCSession.default
        if session.activationState == .notActivated {
          session.activate()
        }
        paired = session.isPaired
      }
      var workoutKit = false
      if #available(iOS 17.0, *) {
        workoutKit = true
      }
      let available = health && (canTellPaired ? paired : true)
      return [
        "available": available,
        "simulator": false,
        "watchPaired": paired,
        "workoutKit": workoutKit,
      ]
      #endif
    }

    AsyncFunction("startWatchApp") { (activityType: String, locationType: String) in
      #if targetEnvironment(simulator)
      throw WatchStartUnavailableException()
      #else
      guard HKHealthStore.isHealthDataAvailable() else {
        throw WatchStartUnavailableException()
      }
      let config = HKWorkoutConfiguration()
      config.activityType = BlobWorkoutStartModule.activity(from: activityType)
      config.locationType = locationType == "outdoor" ? .outdoor : .indoor
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        HKHealthStore().startWatchApp(with: config) { success, error in
          if success {
            cont.resume()
            return
          }
          cont.resume(throwing: error ?? WatchStartUnavailableException())
        }
      }
      #endif
    }

    AsyncFunction("previewWorkoutPlan") { (activityType: String, locationType: String, displayName: String, goalSeconds: Int?) in
      #if targetEnvironment(simulator)
      throw WatchStartUnavailableException()
      #else
      guard #available(iOS 17.0, *) else {
        throw WatchStartUnavailableException()
      }
      try await BlobWorkoutStartModule.presentWorkoutPreview(
        activityType: activityType,
        locationType: locationType,
        displayName: displayName,
        goalSeconds: goalSeconds
      )
      #endif
    }
  }

  static func activity(from raw: String) -> HKWorkoutActivityType {
    switch raw {
    case "running":
      return .running
    case "walking":
      return .walking
    case "cycling":
      return .cycling
    case "swimming":
      return .swimming
    case "yoga":
      return .yoga
    case "traditionalStrengthTraining", "strength":
      return .traditionalStrengthTraining
    default:
      return .mixedCardio
    }
  }

  @available(iOS 17.0, *)
  @MainActor
  static func presentWorkoutPreview(
    activityType: String,
    locationType: String,
    displayName: String,
    goalSeconds: Int?
  ) async throws {
    #if canImport(WorkoutKit)
    let activity = activity(from: activityType)
    let location: HKWorkoutSessionLocationType = locationType == "outdoor" ? .outdoor : .indoor
    let goal: WorkoutGoal
    if let seconds = goalSeconds, seconds > 0 {
      goal = .time(TimeInterval(seconds), .seconds)
    } else {
      goal = .open
    }
    let workout = SingleGoalWorkout(
      activity: activity,
      location: location,
      goal: goal
    )
    _ = displayName
    let plan = WorkoutPlan(.goal(workout))
    guard let presenter = topViewController() else {
      throw WatchStartUnavailableException()
    }
    let host = UIHostingController(rootView: WorkoutPreviewHost(plan: plan))
    host.modalPresentationStyle = .overCurrentContext
    host.view.backgroundColor = .clear
    presenter.present(host, animated: false)
    #else
    throw WatchStartUnavailableException()
    #endif
  }

  static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}

internal final class WatchStartUnavailableException: Exception {
  override var reason: String {
    "unavailable"
  }
}

#if canImport(WorkoutKit)
@available(iOS 17.0, *)
private struct WorkoutPreviewHost: View {
  let plan: WorkoutPlan
  @State private var presented = true

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .workoutPreview(plan, isPresented: $presented)
      .onChange(of: presented) { _, isOn in
        if !isOn {
          UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController?
            .presentedViewController?
            .dismiss(animated: false)
        }
      }
  }
}
#endif
