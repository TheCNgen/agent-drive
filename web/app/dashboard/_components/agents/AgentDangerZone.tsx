export default function AgentDangerZone() {
  return (
    <div className="border-2 border-red-200 bg-red-50 p-4 font-freeman">
      <h4 className="text-red-800 font-bold mb-4">Danger Zone</h4>
      <div className="flex gap-4">
        <button 
          disabled 
          title="Coming soon" 
          className="border-2 border-red-300 bg-white text-red-300 px-4 py-2 cursor-not-allowed opacity-50"
        >
          Suspend agent
        </button>
        <button 
          disabled 
          title="Coming soon" 
          className="bg-red-300 text-white px-4 py-2 cursor-not-allowed opacity-50"
        >
          Delete agent
        </button>
      </div>
    </div>
  );
}
