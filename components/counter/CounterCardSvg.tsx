import { forwardRef } from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { COUNTER_CARD_HEIGHT, COUNTER_CARD_WIDTH, type CounterCardModel } from '@/lib/counter/card';
import { THEME } from '@/lib/theme';

export const CounterCardSvg = forwardRef<Svg, { card: CounterCardModel }>(function CounterCardSvg(
  { card },
  ref,
) {
  const rowH = 78;
  const startY = 320;
  return (
    <Svg
      ref={ref}
      width={COUNTER_CARD_WIDTH}
      height={COUNTER_CARD_HEIGHT}
      viewBox={`0 0 ${COUNTER_CARD_WIDTH} ${COUNTER_CARD_HEIGHT}`}>
      <Rect width={COUNTER_CARD_WIDTH} height={COUNTER_CARD_HEIGHT} fill={THEME.background} />
      <Rect x={48} y={48} width={984} height={1254} rx={44} fill={THEME.surface} />
      <SvgText x={96} y={180} fill={THEME.textPrimary} fontSize={56} fontWeight="800">
        {card.title.slice(0, 28)}
      </SvgText>
      <SvgText x={96} y={240} fill={THEME.textMuted} fontSize={28} fontWeight="600">
        {card.dateLine}
      </SvgText>
      {card.rows.slice(0, 10).map((row, index) => (
        <SvgText
          key={`${row.name}-${index}`}
          x={96}
          y={startY + index * rowH}
          fill={THEME.textPrimary}
          fontSize={36}
          fontWeight="700">
          {`${row.name}   ${row.value}`.slice(0, 36)}
        </SvgText>
      ))}
      <SvgText x={96} y={1240} fill={THEME.accent} fontSize={28} fontWeight="800">
        blOb
      </SvgText>
    </Svg>
  );
});
