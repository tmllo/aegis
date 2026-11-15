import BodyV2 from "../../components/body3d/BodyV2";

export const meta = { title: "Body v2 (Tomas)", direction: "Dive-in layer: lenses, organ inspector, cell close-ups", surface: "Body" };

export default function Concept() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <BodyV2 dataUrl={`${import.meta.env.BASE_URL}data/crew_data.json`} />
    </div>
  );
}
