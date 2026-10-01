#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
NS_ASSUME_NONNULL_BEGIN
/// Sends ONE synthesized multi-finger event. Each path is a flat list of numbers:
///   x0, y0, tDown,  (x, y, t)*,  tLift       (seconds, offsets from the start of the event)
/// All paths share the same clock, so the gap between two taps is exact and no XCUITest
/// "wait for idle" runs between them.
@interface Synth : NSObject
+ (NSString *)run:(NSArray<NSArray<NSNumber *> *> *)paths;
+ (NSString *)runSeq:(NSArray<NSArray<NSNumber *> *> *)taps;
+ (NSString *)caps;
@end
NS_ASSUME_NONNULL_END
