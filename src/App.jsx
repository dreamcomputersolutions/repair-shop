import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Download, 
  Printer, 
  Save, 
  Mail, 
  Smartphone, 
  Monitor, 
  Cpu, 
  Trash2, 
  RefreshCw,
  Wrench
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';

// --- FIREBASE CONFIGURATION ---
// ⚠️ IMPORTANT: REPLACE THESE WITH YOUR ACTUAL KEYS
const firebaseConfig = {
  apiKey: "AIzaSyAPNMDf2F1WQUK8Hmupca3OgPUTrmOAgFg",
  authDomain: "job-notes---dream-computers.firebaseapp.com",
  projectId: "job-notes---dream-computers",
  storageBucket: "job-notes---dream-computers.firebasestorage.app",
  messagingSenderId: "643298237132",
  appId: "1:643298237132:web:336205ab540fc810214069",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = 'repair-shop-v1'; 

const JOB_STATUSES = [
  'Received',
  'In progress',
  'Waiting parts',
  'Completed',
  'Collected'
];

const INITIAL_FORM = {
  customerName: '',
  phone: '',
  email: '',
  deviceType: 'Laptop',
  deviceBrand: '', 
  deviceModel: '',
  serialNumber: '',
  receivedItems: '', 
  problem: '',
  estimatedCost: '',
  notes: '',
  status: 'Received'
};

// --- EMAIL UTILS ---
const generateEmailContent = (job, type) => {
  const subject = type === 'new' 
    ? `Repair Job Received - #${job.jobId} - Dream Computer Solutions`
    : `Update on Repair Job #${job.jobId} - ${job.status}`;

  const body = type === 'new'
    ? `Dear ${job.customerName},%0D%0A%0D%0AWe have received your device for repair.%0D%0A%0D%0AJob ID: ${job.jobId}%0D%0ADevice: ${job.deviceBrand} ${job.deviceModel} (${job.deviceType})%0D%0ASerial: ${job.serialNumber}%0D%0AItems Received: ${job.receivedItems || 'Device only'}%0D%0AProblem: ${job.problem}%0D%0AEstimated Cost: ${job.estimatedCost}%0D%0A%0D%0AWe will notify you when the repair is complete.%0D%0A%0D%0AThank you,%0D%0ADream Computer Solutions%0D%0AWe build your dream.%0D%0A94 76 987 3327`
    : `Dear ${job.customerName},%0D%0A%0D%0AThe status of your repair job (#${job.jobId}) has changed to: ${job.status}.%0D%0A%0D%0ADevice: ${job.deviceBrand} ${job.deviceModel}%0D%0A%0D%0AThank you,%0D%0ADream Computer Solutions`;

  return { subject, body };
};

const handleEmailSend = async (job, type) => {
  // Safety check: If no email is provided, do nothing
  if (!job.email || job.email.trim() === '') return;

  const { subject, body } = generateEmailContent(job, type);
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: job.email,
        subject: decodeURIComponent(subject),
        text: decodeURIComponent(body)
      })
    });
    if (response.ok) {
      alert('Email sent automatically via server!');
      return;
    }
    throw new Error('Server API unavailable');
  } catch (error) {
    console.log("API unavailable, falling back to mailto");
    // Fallback ONLY if automatic sending fails
    window.location.href = `mailto:${job.email}?subject=${subject}&body=${body}`;
  }
};

// --- COMPONENTS ---
const StatusBadge = ({ status }) => {
  const colors = {
    'Received': 'bg-gray-100 text-gray-800 border-gray-200',
    'In progress': 'bg-blue-100 text-blue-800 border-blue-200',
    'Waiting parts': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Completed': 'bg-green-100 text-green-800 border-green-200',
    'Collected': 'bg-purple-100 text-purple-800 border-purple-200'
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colors[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [pendingUpdates, setPendingUpdates] = useState({});

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const jobsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'repair_jobs');
    const q = query(jobsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJobs(jobsData);
    }, (err) => console.error("Error fetching jobs:", err));

    return () => unsubscribe();
  }, [user]);

  const generateJobId = () => {
    const date = new Date();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DCS-${date.getFullYear()}${random}`;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!user) return;
    const newJob = {
      ...formData,
      jobId: generateJobId(),
      createdAt: serverTimestamp(),
      receivedDate: new Date().toISOString().split('T')[0]
    };
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'repair_jobs'), newJob);
      // Only attempt to send email if an email address exists
      if (newJob.email && newJob.email.trim() !== '') {
        handleEmailSend(newJob, 'new');
      }
      setFormData(INITIAL_FORM);
      alert(`Job ${newJob.jobId} created successfully!`);
    } catch (err) {
      console.error("Error saving job:", err);
      alert("Failed to save job.");
    }
  };

  const handleStatusSelectChange = (jobId, newStatus) => {
    setPendingUpdates(prev => ({ ...prev, [jobId]: newStatus }));
  };

  const handleCommitUpdate = async (job) => {
    const newStatus = pendingUpdates[job.id];
    if (!newStatus || newStatus === job.status) return;
    try {
      const jobRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'repair_jobs', job.id);
      await updateDoc(jobRef, { status: newStatus });
      setPendingUpdates(prev => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      // Only attempt to send email if an email address exists
      if (job.email && job.email.trim() !== '') {
        handleEmailSend({ ...job, status: newStatus }, 'update');
      }
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status.");
    }
  };

  const handleDelete = async (jobId) => {
    if(!window.confirm("Are you sure you want to delete this job record?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'repair_jobs', jobId));
    } catch(err) {
      console.error(err);
    }
  };

  const handleExportCSV = () => {
    const headers = ["Job ID", "Customer", "Phone", "Email", "Device Type", "Brand", "Model", "Serial", "Received Items", "Problem", "Status", "Cost", "Date"];
    const rows = jobs.map(j => [
      j.jobId, 
      `"${j.customerName}"`, 
      j.phone, 
      j.email || "", 
      j.deviceType, 
      `"${j.deviceBrand || ''}"`, 
      `"${j.deviceModel}"`, 
      j.serialNumber,
      `"${j.receivedItems || ''}"`,
      `"${j.problem}"`, 
      j.status, 
      j.estimatedCost, 
      j.receivedDate
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `repair_jobs_DCS_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = (job) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert("Please allow popups to print.");
    
    const html = `
      <html>
        <head>
          <title>Receipt - ${job.jobId}</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; max-width: 600px; margin: 0 auto; font-size: 14px; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 20px; margin-bottom: 20px; }
            .logo { max-height: 80px; display: block; margin: 0 auto 10px; }
            .title { font-size: 20px; font-weight: bold; text-transform: uppercase; }
            .motto { font-style: italic; margin: 5px 0; font-size: 12px; }
            .contacts { font-size: 12px; margin-top: 5px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .label { font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
            
            /* DISCLAIMER & SIGNATURES */
            .disclaimer-box { 
              margin-top: 20px; 
              padding: 10px; 
              border: 1px solid #000; 
              font-weight: bold; 
              text-align: center;
              font-size: 12px;
              background: #f9f9f9;
            }
            .signatures {
              display: flex;
              justify-content: space-between;
              margin-top: 50px;
              padding-top: 10px;
            }
            .sig-block {
              text-align: center;
              width: 40%;
            }
            .sig-line {
              border-top: 1px solid #000;
              margin-bottom: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${window.location.origin}/LOGO.png" class="logo" alt="Dream Computer Solutions" onerror="this.style.display='none'" />
            <div class="title">Dream Computer Solutions</div>
            <div class="motto">We build your dream.</div>
            <div class="contacts">94 76 987 3327 | +94 474 490 022</div>
            <h3>Repair Receipt</h3>
          </div>
          
          <div class="row"><span class="label">Job ID:</span> <span>${job.jobId}</span></div>
          <div class="row"><span class="label">Date:</span> <span>${job.receivedDate}</span></div>
          <div class="row"><span class="label">Customer:</span> <span>${job.customerName}</span></div>
          <div class="row"><span class="label">Contact:</span> <span>${job.phone}</span></div>
          
          <hr style="border: 0; border-top: 1px dashed #000; margin: 15px 0;" />
          
          <div class="row"><span class="label">Device:</span> <span>${job.deviceType}</span></div>
          <div class="row"><span class="label">Brand/Model:</span> <span>${job.deviceBrand} ${job.deviceModel}</span></div>
          <div class="row"><span class="label">Serial:</span> <span>${job.serialNumber}</span></div>
          <div class="row"><span class="label">Items Rec:</span> <span>${job.receivedItems || '-'}</span></div>
          <div class="row"><span class="label">Problem:</span> <span>${job.problem}</span></div>
          <div class="row"><span class="label">Est. Cost:</span> <span>${job.estimatedCost}</span></div>
          
          <hr style="border: 0; border-top: 1px dashed #000; margin: 15px 0;" />
          
          <div class="row"><span class="label">Current Status:</span> <span>${job.status}</span></div>

          <!-- DISCLAIMER -->
          <div class="disclaimer-box">
            IMPORTANT: We are not responsible for any items not collected within 30 days of completion notification.
          </div>

          <!-- SIGNATURES -->
          <div class="signatures">
            <div class="sig-block">
              <div class="sig-line"></div>
              <div>Customer Signature</div>
            </div>
            <div class="sig-block">
              <div class="sig-line"></div>
              <div>Authorized Signature</div>
            </div>
          </div>

          <div class="footer"><p>Thank you for trusting Dream Computer Solutions!</p></div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = 
        job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.jobId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.phone.includes(searchTerm);
      const matchesStatus = statusFilter === 'All' || job.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  if (!user) return <div className="flex h-screen items-center justify-center text-gray-500">Connecting to Shop System...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 font-sans text-slate-900 p-4 md:p-8">
      
      {/* HEADER */}
      <header className="mb-8 bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center">
        <div className="flex flex-col md:flex-row items-center gap-6 mb-4 md:mb-0">
          {/* LOGO DISPLAY */}
          <img src="/LOGO.png" alt="Dream Computer Solutions" className="h-24 w-auto object-contain" />
          
          <div className="text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-bold text-indigo-900">Dream Computer Solutions</h1>
            <p className="text-indigo-600 font-medium italic">We build your dream.</p>
            <p className="text-sm text-slate-600 mt-1">+94 76 987 3327 | +94 474 490 022</p>
          </div>
        </div>
        
        <div className="flex gap-3">
           <div className="bg-indigo-50 p-3 rounded-lg text-center min-w-[100px] shadow-sm">
             <p className="text-xs text-indigo-600 font-bold uppercase">Active</p>
             <p className="text-2xl font-bold text-indigo-900">{jobs.filter(j => j.status !== 'Collected').length}</p>
           </div>
           <div className="bg-green-50 p-3 rounded-lg text-center min-w-[100px] shadow-sm">
             <p className="text-xs text-green-600 font-bold uppercase">Done</p>
             <p className="text-2xl font-bold text-green-900">{jobs.filter(j => j.status === 'Completed').length}</p>
           </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* LEFT: NEW JOB FORM */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl shadow-lg shadow-indigo-100 border border-slate-200 p-6 sticky top-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
              <div className="p-2 bg-indigo-600 rounded-lg text-white"><Plus size={18} /></div>
              New Repair Job
            </h2>
            
            <form onSubmit={handleCreateJob} className="space-y-4">
              
              {/* Customer Info */}
              <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                   Customer Details
                </h3>
                <input required name="customerName" placeholder="Customer Name" value={formData.customerName} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input required name="phone" placeholder="Phone Number" value={formData.phone} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                  <input type="email" name="email" placeholder="Email Address (Optional)" value={formData.email} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                </div>
              </div>

              {/* Device Info */}
              <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    Device Details
                 </h3>
                <div className="flex gap-2">
                   <select name="deviceType" value={formData.deviceType} onChange={handleInputChange} className="p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none">
                     <option>Laptop</option>
                     <option>Desktop</option>
                     <option>Phone</option>
                     <option>Tablet</option>
                     <option>Printer</option>
                     <option>Other</option>
                   </select>
                   <input required name="deviceBrand" placeholder="Brand (e.g. Dell)" value={formData.deviceBrand} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                </div>
                <input required name="deviceModel" placeholder="Model Name" value={formData.deviceModel} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                <input required name="serialNumber" placeholder="Serial Number / MAC ID" value={formData.serialNumber} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                <input name="receivedItems" placeholder="Items Received (Charger, Bag...)" value={formData.receivedItems} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                <textarea required name="problem" placeholder="Problem Description" value={formData.problem} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none placeholder-slate-400" />
              </div>

              {/* Job Info */}
               <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Job Details</h3>
                 <div className="flex gap-2">
                   <input name="estimatedCost" placeholder="Est. Cost (LKR)" value={formData.estimatedCost} onChange={handleInputChange} className="w-full p-2 text-sm bg-white text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" />
                   <div className="w-full p-2 text-sm bg-gray-200 rounded text-gray-600 font-medium text-center cursor-not-allowed">Status: Received</div>
                 </div>
               </div>

              <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex justify-center items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95">
                <Save size={18} /> Create Job & Notify
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT: JOB LIST */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Controls */}
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input 
                placeholder="Search by name, ID, serial..." 
                className="w-full pl-10 pr-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select 
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                {JOB_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 font-medium">
                <Download size={18} /> <span className="hidden sm:inline">Export CSV</span>
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white rounded-xl shadow-lg shadow-indigo-50 border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="p-4">ID / Date</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Device / Issue</th>
                    <th className="p-4 text-center">Status Action</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJobs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <Wrench size={48} className="text-slate-200" />
                          <p>No repair jobs found.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filteredJobs.map(job => {
                    const hasPendingChange = pendingUpdates[job.id] && pendingUpdates[job.id] !== job.status;
                    
                    return (
                    <tr key={job.id} className={`hover:bg-slate-50 transition-colors ${hasPendingChange ? 'bg-amber-50' : ''}`}>
                      <td className="p-4 align-top">
                        <div className="font-bold text-indigo-600 text-sm">{job.jobId}</div>
                        <div className="text-xs text-slate-500 mt-1">{job.receivedDate}</div>
                      </td>
                      <td className="p-4 align-top">
                        <div className="font-medium text-slate-900">{job.customerName}</div>
                        <div className="text-xs text-slate-500 flex flex-col">
                          <span>{job.phone}</span>
                          <span className="truncate max-w-[120px] text-indigo-400">{job.email}</span>
                        </div>
                      </td>
                      <td className="p-4 align-top">
                         <div className="flex items-center gap-2 mb-1">
                            {job.deviceType === 'Laptop' ? <Monitor size={14} /> : 
                             job.deviceType === 'Phone' ? <Smartphone size={14} /> : <Cpu size={14} />}
                            <span className="text-sm font-medium">{job.deviceBrand} {job.deviceModel}</span>
                         </div>
                         <div className="text-xs text-slate-500 font-mono mb-1">SN: {job.serialNumber}</div>
                         <p className="text-xs text-slate-600 italic bg-slate-100 p-1 rounded inline-block max-w-xs truncate">
                           {job.problem}
                         </p>
                      </td>
                      <td className="p-4 align-top text-center min-w-[180px]">
                        <div className="flex flex-col gap-2 items-center">
                           <StatusBadge status={job.status} />
                           
                           <div className="flex items-center gap-1 mt-1">
                              <select 
                                className="text-xs border rounded p-1 max-w-[100px] bg-white"
                                value={pendingUpdates[job.id] || job.status}
                                onChange={(e) => handleStatusSelectChange(job.id, e.target.value)}
                              >
                                {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              
                              {hasPendingChange && (
                                <button 
                                  onClick={() => handleCommitUpdate(job)}
                                  className="p-1 bg-green-600 text-white rounded shadow-sm hover:bg-green-700 transition-colors animate-pulse"
                                  title="Update & Notify Customer"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              )}
                           </div>
                           {hasPendingChange && <span className="text-[10px] text-red-500 font-bold">Unsaved! Click icon</span>}
                        </div>
                      </td>
                      <td className="p-4 align-top text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handlePrint(job)}
                            className="p-2 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Print Receipt"
                          >
                            <Printer size={18} />
                          </button>
                          <button 
                            onClick={() => handleEmailSend(job, 'update')}
                            className="p-2 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                            title="Email Status Update"
                          >
                            <Mail size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(job.id)}
                            className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
              <span>Showing {filteredJobs.length} jobs</span>
              <span>Note: Updating status triggers customer email.</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}