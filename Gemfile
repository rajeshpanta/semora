source 'https://rubygems.org'

# EAS Build picks up this Gemfile and uses bundler-managed CocoaPods instead of
# its image default. Every build of an otherwise-known-good config (matching
# green build 14) was failing `pod install` with an opaque "Unknown error";
# pinning to 1.16.2 — the exact version that installs this project's pods
# cleanly locally — sidesteps an EAS-side CocoaPods version regression.
ruby ">= 2.6.10"

gem 'cocoapods', '1.16.2'
