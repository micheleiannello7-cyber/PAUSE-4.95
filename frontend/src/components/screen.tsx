// PAUSE — root container for stack screens. On native the navigator already
// animates the push/pop; on web (where the native stack has no transitions)
// the content eases in with a soft fade + slide so route changes never "flash".
import { ReactNode } from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import Animated, { FadeInRight, Easing } from "react-native-reanimated";

type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string };

const enter = FadeInRight.duration(360)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0, transform: [{ translateX: 16 }] });

export function Screen({ children, style, testID }: Props) {
  if (Platform.OS !== "web") {
    return <View style={style} testID={testID}>{children}</View>;
  }
  return (
    <Animated.View entering={enter} style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}
