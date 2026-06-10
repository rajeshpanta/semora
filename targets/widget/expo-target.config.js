/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'Semora Today',
  // Widgets use modern WidgetKit APIs (containerBackground) — iOS 17+.
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.rajeshpanta.syllabussnap'],
  },
  colors: {
    $accent: '#6B46C1',
    $widgetBackground: '#FAF9F5',
  },
};
