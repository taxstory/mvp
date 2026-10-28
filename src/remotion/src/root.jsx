// src/remotion/src/root.jsx
// Remotion entry point — registers the TaxStory composition.
// Bundle this with: npx remotion bundle src/remotion/src/root.jsx
// Then deploy to S3 with: npx remotion lambda sites create

import { Composition } from 'remotion';
import React from 'react';
import TaxStoryComposition from './compositions/TaxStoryComposition';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="TaxStoryWalkthrough"
        component={TaxStoryComposition}
        // durationInFrames is overridden per-render via inputProps.totalFrames
        durationInFrames={900}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          segments:   [],
          parsedData: {},
          year:       2025,
          firmName:   'TaxStory',
          firmColor:  '#6B5CE7',
        }}
        calculateMetadata={({ props }) => {
          // Dynamically set duration from segment durations
          if (props.segments && props.segments.length > 0) {
            const totalFrames = props.segments.reduce(
              (sum, seg) => sum + Math.round(((seg.duration_ms || 4000) / 1000) * 30),
              0
            );
            return { durationInFrames: totalFrames };
          }
          return {};
        }}
      />
    </>
  );
};
