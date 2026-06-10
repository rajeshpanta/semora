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
    // Dark variant required: SwiftUI text uses adaptive .primary/.secondary,
    // which invert to white in dark mode — on an always-light background
    // the widget was illegible. NOTE: the plugin's d.ts example says
    // { color, darkColor } but with-widget.js actually reads
    // { light, dark } — use the implementation's shape.
    $widgetBackground: { light: '#FAF9F5', dark: '#1C1B22' },
  },
};
