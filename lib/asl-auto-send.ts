import { AslStabilizer, emptyAslSample, sampleProof, type AslSample } from "./asl-inference";

export const AUTO_SIGN_CONFIDENCE = .9;
export const AUTO_SIGN_HOLD_MS = 3000;

/** One fresh, uninterrupted high-confidence streak per Kikazaru request.
 * A render/timer cannot add evidence: only distinct captured frames count. */
export class AslAutoSendGate {
    private key: string | null = null;
    private claimedKey: string | null = null;
    private activatedAt = 0;
    private lastAt = -1;
    private sample = emptyAslSample();
    private filter = new AslStabilizer(AUTO_SIGN_CONFIDENCE, AUTO_SIGN_HOLD_MS, true);

    private clear(now: number) {
        this.filter.reset(); this.lastAt = -1; this.activatedAt = now;
        this.sample = emptyAslSample();
    }
    observe(key: string | null, observation: AslSample, now: number, canSend = true) {
        if (key !== this.key) { this.key = key; this.clear(now); }
        if (!key || key === this.claimedKey) return { sample: emptyAslSample(), proof: null };
        if (!observation.letter || observation.at < this.activatedAt || now < observation.at || now - observation.at > 1500) {
            this.clear(now);
            return { sample: this.sample, proof: null };
        }
        if (observation.at !== this.lastAt) {
            this.sample = this.filter.observe(observation.letter, observation.confidence, observation.at, now);
            this.lastAt = observation.at;
        }
        const proof = canSend ? sampleProof(this.sample, now) : null;
        if (proof) this.claimedKey = key; // Claim before starting the async request.
        return { sample: this.sample, proof };
    }
    retry(key: string, now: number) {
        if (this.claimedKey === key) this.claimedKey = null;
        if (this.key === key) this.clear(now);
    }
}
