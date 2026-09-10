**Failed** blow harvests for `boss.warden`, kept because this document's own rule is that a
recorded failure is a generation the next person does not have to spend.

`f0-f8`        seed 37, "crashing straight down ... deep forward lunge". The loop CLOSES:
               its last frames measure 1001-1044 from rest where the apex measures 1485, so
               they are nearer rest than the wind-up is and read as an unwind. f6-f8 are
               also off-model (squared shoulders, sunk helm).
`lunge-f0..f8` seed 53, "deep kneeling lunge ... never straightens up". Passes every
               numeric check — impact-vs-rest 1735-1745 against a 1485 bar, monotonic
               vs-apex, accent 76-84 chroma — and the art is a knight deformed into a
               squat blob with the legs merged. This is the counter-example that proves
               the impact-vs-rest comparison is a VETO, not an acceptance.

A third attempt (seed 23, quantized source) is not kept: quantizing to 24 colours to dodge
the upload bug destroyed the 4-pixel accent outright, which is its own lesson and is
written up rather than stored.

The conclusion is in docs/animation.md, "Stage B: the Warden's blow needs a hand-authored
pose": this generator interpolates and re-renders but does not POSE, and a strike's
defining moment is a pose. Do not spend a fourth generation re-prompting; the next attempt
should be an authored impact frame, pinned.
