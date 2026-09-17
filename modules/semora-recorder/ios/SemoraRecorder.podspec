Pod::Spec.new do |s|
  s.name           = 'SemoraRecorder'
  s.version        = '1.0.0'
  s.summary        = "Semora's lecture recorder: one continuous microphone session, chunked to disk."
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Semora'
  s.homepage       = 'https://semoraai.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'UIKit', 'UserNotifications'
  # Newer than the app's iOS 15.1 minimum; every use is behind #available.
  s.weak_frameworks = 'ActivityKit', 'AppIntents'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
