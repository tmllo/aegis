// One shared turn for the body page (Emile, 16 Nov): the suit turntable, the body and the skeleton all
// read and write the same angle, so switching views keeps the same side facing you.
// a = 0 is the front; it grows as the view circles counter-clockwise seen from above.
export const SPIN_SPEED = 0.125; // radians per second: one turn in about 50 s
export const spin = { a: 0 };
