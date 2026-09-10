The shipped `strike` frames for `boss.war-queen`, on the padded 98x132 canvas.

f0-f5   the rise:   apex -> impact, harvested from `../war-queen-harvest-rise` f1-f6.
                    That run's f0 is the apex itself and is already the cast's last
                    frame, so it is not repeated here.
f6-f11  the settle: impact -> rest, a run pinned at BOTH ends (first frame the impact
                    pose, `last_frame_base64` the rest pose). Lands on rest to 2
                    silhouette pixels with no penultimate retreat.

The impact pose in between is `../war-queen-impact-pad.png`, which is the rise run's
peak frame — its travel from the apex runs 0 2 11 18 23 29 30 and falls back after,
so f6 of that run is the furthest the sequence gets.

Two sibling directories are negative results, kept so the generations are not re-spent:
`war-queen-harvest-overhead` put real arms above the helmet and came back off-model
(forearms as detached tubes), and `war-queen-template-throw` is `animate_character`'s
keyframed throw, which is a whole-character re-render at 83-90px against the idle's 98.
See docs/animation.md.
