Pod::Spec.new do |s|
  s.name           = 'SemoraWatchBridge'
  s.version        = '1.0.0'
  s.summary        = 'iPhone-side WatchConnectivity bridge for the Semora Watch companion.'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Semora'
  s.homepage       = 'https://semoraai.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift auto-links system frameworks it imports, but this pod builds as a
  # static framework where that inference is not guaranteed to reach the host
  # target's link step. Naming it here is cheap and removes the ambiguity.
  s.frameworks = 'WatchConnectivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
