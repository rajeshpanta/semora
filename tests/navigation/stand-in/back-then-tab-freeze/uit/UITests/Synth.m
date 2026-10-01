#import "Synth.h"
#import <XCTest/XCTest.h>

@protocol VTPath <NSObject>
- (instancetype)initForTouchAtPoint:(CGPoint)point offset:(double)offset;
- (void)moveToPoint:(CGPoint)point atOffset:(double)offset;
- (void)liftUpAtOffset:(double)offset;
@end
@protocol VTRecord <NSObject>
- (instancetype)initWithName:(NSString *)name interfaceOrientation:(long long)orientation;
- (void)addPointerEventPath:(id)path;
- (BOOL)synthesizeWithError:(NSError **)error;
@end

@protocol VTPath2 <NSObject>
- (void)pressDownAtOffset:(double)offset;
@end

@implementation Synth
+ (NSString *)caps {
  Class P = NSClassFromString(@"XCPointerEventPath");
  Class R = NSClassFromString(@"XCSynthesizedEventRecord");
  return [NSString stringWithFormat:@"path=%d record=%d pressDownAtOffset=%d synthesizeWithError=%d",
          P != Nil, R != Nil, [P instancesRespondToSelector:@selector(pressDownAtOffset:)], [R instancesRespondToSelector:@selector(synthesizeWithError:)]];
}
/// One finger, several taps on ONE path: each element is x, y, tDown, tLift.
+ (NSString *)runSeq:(NSArray<NSArray<NSNumber *> *> *)taps {
  Class P = NSClassFromString(@"XCPointerEventPath");
  Class R = NSClassFromString(@"XCSynthesizedEventRecord");
  if (P == Nil || R == Nil) return @"ERR: private XCTest classes missing";
  id<VTRecord> rec = [(id<VTRecord>)[R alloc] initWithName:@"vtabseq" interfaceOrientation:1];
  id path = nil;
  for (NSArray<NSNumber *> *t in taps) {
    CGPoint pt = CGPointMake(t[0].doubleValue, t[1].doubleValue);
    if (path == nil) {
      path = [(id<VTPath>)[P alloc] initForTouchAtPoint:pt offset:t[2].doubleValue];
    } else {
      [(id<VTPath>)path moveToPoint:pt atOffset:t[2].doubleValue];
      [(id<VTPath2>)path pressDownAtOffset:t[2].doubleValue];
    }
    [(id<VTPath>)path liftUpAtOffset:t[3].doubleValue];
  }
  [rec addPointerEventPath:path];
  NSError *err = nil;
  BOOL ok = [rec synthesizeWithError:&err];
  return ok ? @"OK" : [NSString stringWithFormat:@"ERR: %@", err];
}
+ (NSString *)run:(NSArray<NSArray<NSNumber *> *> *)paths {
  Class P = NSClassFromString(@"XCPointerEventPath");
  Class R = NSClassFromString(@"XCSynthesizedEventRecord");
  if (P == Nil || R == Nil) return @"ERR: private XCTest classes missing";
  id<VTRecord> rec = [(id<VTRecord>)[R alloc] initWithName:@"vtab" interfaceOrientation:1];
  for (NSArray<NSNumber *> *p in paths) {
    NSUInteger n = p.count;
    if (n < 4 || (n - 1) % 3 != 0) return @"ERR: bad path";
    id<VTPath> path = [(id<VTPath>)[P alloc] initForTouchAtPoint:CGPointMake(p[0].doubleValue, p[1].doubleValue) offset:p[2].doubleValue];
    for (NSUInteger i = 3; i + 2 < n; i += 3) {
      [path moveToPoint:CGPointMake(p[i].doubleValue, p[i + 1].doubleValue) atOffset:p[i + 2].doubleValue];
    }
    [path liftUpAtOffset:p[n - 1].doubleValue];
    [rec addPointerEventPath:path];
  }
  if (![(id)rec respondsToSelector:@selector(synthesizeWithError:)]) return @"ERR: no synthesizeWithError:";
  NSError *err = nil;
  BOOL ok = [rec synthesizeWithError:&err];
  return ok ? @"OK" : [NSString stringWithFormat:@"ERR: %@", err];
}
@end
