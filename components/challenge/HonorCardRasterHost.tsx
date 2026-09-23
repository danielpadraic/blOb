import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type Svg from 'react-native-svg';

import { HonorProofCard } from '@/components/challenge/HonorProofCard';
import {
  honorCardRasterFailed,
  honorCardRasterSucceeded,
  subscribeHonorCardRaster,
} from '@/lib/checkin/honorCardRaster';
import { rasterHonorCardOnWeb } from '@/lib/checkin/honorCardWeb';
import { HONOR_CARD_HEIGHT, HONOR_CARD_WIDTH, type HonorCardModel } from '@/lib/checkin/honorCard';
import { writeWorkoutCardPng } from '@/lib/health/workoutCardFile';

const SETTLE_MS = 220;

/**
 * Off-screen honor recap raster. Web uses canvas so blob.mobi gets a JPEG.
 * iOS / Android use the same SVG the feed draws.
 */
export function HonorCardRasterHost() {
  const svgRef = useRef<Svg | null>(null);
  const [card, setCard] = useState<HonorCardModel | null>(null);

  useEffect(() => {
    return subscribeHonorCardRaster((job) => {
      setCard(job?.card ?? null);
    });
  }, []);

  useEffect(() => {
    if (!card) {
      return;
    }
    let cancelled = false;
    if (Platform.OS === 'web') {
      void rasterHonorCardOnWeb(card)
        .then((uri) => {
          if (!cancelled) {
            honorCardRasterSucceeded(uri);
            setCard(null);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            honorCardRasterFailed(caught instanceof Error ? caught.message : 'Could not build that check-in card.');
            setCard(null);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => {
      const node = svgRef.current;
      if (!node || typeof node.toDataURL !== 'function') {
        honorCardRasterFailed('Could not build that check-in card.');
        setCard(null);
        return;
      }
      try {
        node.toDataURL(
          (base64) => {
            if (cancelled) {
              return;
            }
            void (async () => {
              try {
                const uri = await writeWorkoutCardPng(base64, `honor-${Date.now()}`);
                if (cancelled) {
                  return;
                }
                honorCardRasterSucceeded(uri);
                setCard(null);
              } catch (caught) {
                if (!cancelled) {
                  honorCardRasterFailed(
                    caught instanceof Error ? caught.message : 'Could not build that check-in card.',
                  );
                  setCard(null);
                }
              }
            })();
          },
          { width: HONOR_CARD_WIDTH, height: HONOR_CARD_HEIGHT },
        );
      } catch {
        honorCardRasterFailed('Could not build that check-in card.');
        setCard(null);
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [card]);

  if (Platform.OS === 'web' || !card) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: HONOR_CARD_WIDTH, height: HONOR_CARD_HEIGHT, left: -4000, top: 0 }}>
      <HonorProofCard ref={svgRef} card={card} width={HONOR_CARD_WIDTH} height={HONOR_CARD_HEIGHT} />
    </View>
  );
}
