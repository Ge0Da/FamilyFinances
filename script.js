const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const transDateInput = document.getElementById('transDate');
if (transDateInput) {
    transDateInput.value = new Date().toISOString().split('T')[0];
}

let width, height;
let particles = [];
let hoveredNode = null;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let offset = { x: 0, y: 0 };
let animationPaused = false;
let baby2Mode = false;
let currentView = 'transactions';
let selectedSegment = null;
let wheelAnimation = 0;
let explodedCategory = null;
let segmentAnimations = {};

// Timeline specific variables
let timelineOffset = { x: 0, y: 0 };
let timelineZoom = 1;
let selectedEvent = null;
let draggingEvent = null;
let riverAnimation = 0;
let waveOffset = 0;

// Bubble cloud specific variables
let bubbles = [];
let selectedBubble = null;
let bubblePhysics = true;
let filterCategory = 'all';
let bubbleView = 'month'; // 'month', 'week', 'all'
let attractors = {};
let mouseAttractor = null;
// Life events
let lifeEvents = [
    { id: 1, name: 'Current', year: 0, month: 0, type: 'milestone', locked: true },
    { id: 2, name: 'Baby #2 Arrives', year: 1, month: 6, type: 'child', oneTimeCost: 5000, monthlyCost: 1000 },
    { id: 3, name: 'Child 1 Starts School', year: 4, month: 9, type: 'education', monthlyCost: -200 },
    { id: 4, name: 'Larger Home', year: 6, month: 0, type: 'housing', oneTimeCost: 20000, monthlyCost: 500 },
    { id: 5, name: 'Child 2 Starts School', year: 8, month: 9, type: 'education', monthlyCost: -200 },
    { id: 6, name: 'College Fund Target', year: 15, month: 0, type: 'milestone', targetAmount: 100000 },
    { id: 7, name: 'Retirement', year: 30, month: 0, type: 'milestone', locked: true }
];

// Event type configurations
const eventTypes = {
    milestone: { color: '#3b82f6', icon: '🎯' },
    child: { color: '#ec4899', icon: '👶' },
    education: { color: '#8b5cf6', icon: '🎓' },
    housing: { color: '#ef4444', icon: '🏠' },
    health: { color: '#10b981', icon: '💊' },
    travel: { color: '#06b6d4', icon: '✈️' }
};
// Sample transactions for bubble view (will be replaced by user input)
let transactions;
try {
    const stored = localStorage.getItem('familyFinanceTransactions');
    if (stored) {
        transactions = JSON.parse(stored).map(t => ({ ...t, date: new Date(t.date) }));
    }
} catch (err) {
    console.warn('localStorage unavailable, using defaults', err);
}
if (!transactions) transactions = [
    { id: Date.now() + 1, name: 'Grocery Store', amount: 156, category: 'food', type: 'expense', date: new Date(2024, 5, 25), recurring: false },
    { id: Date.now() + 2, name: 'Parent 1 Salary', amount: 5500, category: 'income', type: 'income', date: new Date(2024, 5, 1), recurring: true },
    { id: Date.now() + 3, name: 'Parent 2 Salary', amount: 2800, category: 'income', type: 'income', date: new Date(2024, 5, 1), recurring: true },
    { id: Date.now() + 4, name: 'Daycare', amount: 800, category: 'children', type: 'expense', date: new Date(2024, 5, 1), recurring: true },
    { id: Date.now() + 5, name: 'Mortgage', amount: 1800, category: 'housing', type: 'expense', date: new Date(2024, 5, 1), recurring: true },
];
class Bubble {
    constructor(transaction) {
        this.transaction = transaction;
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.radius = Math.sqrt(transaction.amount) * 2;
        this.targetRadius = this.radius;
        this.opacity = 0;
        this.targetOpacity = 0.8;
        this.selected = false;
        this.hovered = false;
        const cat = budgetCategories.find(c => c.id === transaction.category);
        this.color = cat ? cat.color : '#ffffff';
    }
    
    update() {
        this.opacity += (this.targetOpacity - this.opacity) * 0.1;
        this.radius += (this.targetRadius - this.radius) * 0.1;
        if (bubblePhysics) {
            this.vx *= 0.98;
            this.vy *= 0.98;
            if (attractors[this.transaction.category]) {
                const attractor = attractors[this.transaction.category];
                const dx = attractor.x - this.x;
                const dy = attractor.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 10) {
                    const force = 0.001 * this.radius;
                    this.vx += (dx / dist) * force;
                    this.vy += (dy / dist) * force;
                }
            }
            if (mouseAttractor && this.hovered) {
                const dx = mouseAttractor.x - this.x;
                const dy = mouseAttractor.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > this.radius) {
                    const force = 0.05;
                    this.vx += (dx / dist) * force;
                    this.vy += (dy / dist) * force;
                }
            }
            this.x += this.vx;
            this.y += this.vy;
            if (this.x - this.radius < 0 || this.x + this.radius > width) {
                this.vx *= -0.8;
                this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
            }
            if (this.y - this.radius < 0 || this.y + this.radius > height) {
                this.vy *= -0.8;
                this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));
            }
        }
        this.targetRadius = this.hovered || this.selected ? Math.sqrt(this.transaction.amount) * 2.5 : Math.sqrt(this.transaction.amount) * 2;
        this.targetOpacity = this.hovered || this.selected ? 1 : 0.8;
    }
    
    checkCollision(other) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = this.radius + other.radius;
        if (dist < minDist && dist > 0) {
            const force = (minDist - dist) * 0.5;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            this.vx -= fx / this.radius;
            this.vy -= fy / this.radius;
            other.vx += fx / other.radius;
            other.vy += fy / other.radius;
        }
    }
    
    contains(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        return Math.sqrt(dx * dx + dy * dy) < this.radius;
    }
    
    pop() {
        this.targetRadius = 0;
        this.targetOpacity = 0;
    }
}
let budgetCategories = [
    { id: 'housing', name: 'Housing', amount: 2200, color: '#ef4444', subcategories: [{ name: 'Rent/Mortgage', amount: 1800 }, { name: 'Insurance', amount: 200 }, { name: 'Maintenance', amount: 200 }] },
    { id: 'food', name: 'Food & Groceries', amount: 1200, color: '#eab308', subcategories: [{ name: 'Groceries', amount: 800 }, { name: 'Dining Out', amount: 300 }, { name: 'Baby Food', amount: 100 }] },
    { id: 'children', name: 'Children', amount: 1200, color: '#ec4899', subcategories: [{ name: 'Childcare', amount: 800 }, { name: 'Child 1 Activities', amount: 200 }, { name: 'Clothing', amount: 100 }, { name: 'Toys & Books', amount: 100 }] },
    { id: 'transportation', name: 'Transportation', amount: 600, color: '#06b6d4', subcategories: [{ name: 'Car Payment', amount: 300 }, { name: 'Gas', amount: 200 }, { name: 'Maintenance', amount: 100 }] },
    { id: 'utilities', name: 'Utilities', amount: 400, color: '#8b5cf6', subcategories: [{ name: 'Electric', amount: 150 }, { name: 'Water', amount: 80 }, { name: 'Internet', amount: 70 }, { name: 'Phone', amount: 100 }] },
    { id: 'savings', name: 'Savings & Goals', amount: 1500, color: '#10b981', subcategories: [{ name: 'Emergency Fund', amount: 700 }, { name: 'Retirement', amount: 500 }, { name: 'Baby #2 Fund', amount: 300 }] },
    { id: 'income', name: 'Income', amount: 0, color: '#4ade80', subcategories: [] },
    { id: 'other', name: 'Other', amount: 0, color: '#64748b', subcategories: [] }
];
let incomeSources = [
    { id: 'salary1', name: 'Parent 1 Salary', amount: 5500, y: 0.3 },
    { id: 'salary2', name: 'Parent 2 Salary', amount: 2800, y: 0.5 },
    { id: 'investments', name: 'Investments', amount: 200, y: 0.7 }
];
let expenseCategories = [
    { id: 'housing', name: 'Housing', amount: 2200, y: 0.15, color: '#ef4444' },
    { id: 'childcare', name: 'Childcare', amount: 800, y: 0.3, color: '#f59e0b' },
    { id: 'food', name: 'Food & Groceries', amount: 1200, y: 0.45, color: '#eab308' },
    { id: 'transportation', name: 'Transportation', amount: 600, y: 0.6, color: '#06b6d4' },
    { id: 'utilities', name: 'Utilities', amount: 400, y: 0.7, color: '#8b5cf6' },
    { id: 'child1', name: 'Child 1 Expenses', amount: 400, y: 0.8, color: '#ec4899' },
    { id: 'savings', name: 'Savings', amount: 1200, y: 0.9, color: '#10b981' },
    { id: 'baby2fund', name: 'Baby #2 Fund', amount: 300, y: 0.95, color: '#22c55e', visible: true }
];
let flows = [
    { from: 'salary1', to: 'housing', amount: 1500 },
    { from: 'salary1', to: 'childcare', amount: 800 },
    { from: 'salary1', to: 'food', amount: 800 },
    { from: 'salary1', to: 'savings', amount: 800 },
    { from: 'salary1', to: 'child1', amount: 300 },
    { from: 'salary1', to: 'baby2fund', amount: 300 },
    { from: 'salary1', to: 'transportation', amount: 200 },
    { from: 'salary1', to: 'utilities', amount: 200 },
    { from: 'salary2', to: 'housing', amount: 700 },
    { from: 'salary2', to: 'food', amount: 400 },
    { from: 'salary2', to: 'transportation', amount: 400 },
    { from: 'salary2', to: 'utilities', amount: 200 },
    { from: 'salary2', to: 'savings', amount: 400 },
    { from: 'salary2', to: 'child1', amount: 100 },
    { from: 'investments', to: 'savings', amount: 200 }
];
const baby2Flows = [
    { from: 'salary1', to: 'childcare', amount: 600, extra: true },
    { from: 'salary2', to: 'childcare', amount: 400, extra: true },
    { from: 'savings', to: 'baby2fund', amount: -200, extra: true }
];
class Particle {
    constructor(flow) {
        this.flow = flow;
        this.progress = 0;
        this.speed = 0.5 + Math.random() * 0.5;
        this.size = 2 + Math.random() * 3;
        this.opacity = 0.6 + Math.random() * 0.4;
    }
    update() {
        this.progress += this.speed * 0.01;
        if (this.progress > 1) this.progress = 0;
    }
    getPosition() {
        const source = incomeSources.find(s => s.id === this.flow.from);
        const target = expenseCategories.find(t => t.id === this.flow.to);
        if (!source || !target) return null;
        const startX = width * 0.15;
        const startY = height * source.y;
        const endX = width * 0.85;
        const endY = height * target.y;
        const cp1X = startX + (endX - startX) * 0.3;
        const cp1Y = startY;
        const cp2X = startX + (endX - startX) * 0.7;
        const cp2Y = endY;
        const t = this.progress;
        const x = Math.pow(1-t,3)*startX + 3*Math.pow(1-t,2)*t*cp1X + 3*(1-t)*Math.pow(t,2)*cp2X + Math.pow(t,3)*endX;
        const y = Math.pow(1-t,3)*startY + 3*Math.pow(1-t,2)*t*cp1Y + 3*(1-t)*Math.pow(t,2)*cp2Y + Math.pow(t,3)*endY;
        return { x: x + offset.x, y: y + offset.y };
    }
}
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
function createParticles() {
    particles = [];
    const activeFlows = baby2Mode ? [...flows, ...baby2Flows] : flows;
    activeFlows.forEach(flow => {
        const particleCount = Math.ceil(Math.abs(flow.amount) / 100);
        for (let i = 0; i < particleCount; i++) {
            const p = new Particle(flow);
            p.progress = Math.random();
            particles.push(p);
        }
    });
}
function createBubbles() {
    bubbles = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;
    const categories = budgetCategories.map(c => c.id);
    categories.forEach((cat, idx) => {
        const angle = (idx / categories.length) * Math.PI * 2 - Math.PI / 2;
        attractors[cat] = { x: centerX + Math.cos(angle)*radius, y: centerY + Math.sin(angle)*radius };
    });
    let filtered = transactions;
    if (bubbleView === 'month') {
        const now = new Date();
        filtered = transactions.filter(t => t.date.getMonth() === now.getMonth() && t.date.getFullYear() === now.getFullYear());
    } else if (bubbleView === 'week') {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = transactions.filter(t => t.date >= weekAgo);
    }
    if (filterCategory !== 'all') filtered = filtered.filter(t => t.category === filterCategory);
    filtered.forEach(t => bubbles.push(new Bubble(t)));
}
function drawBubbleCloud() {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    Object.entries(attractors).forEach(([catId,pos]) => {
        const category = budgetCategories.find(c => c.id === catId);
        if (category) {
            ctx.beginPath();
            ctx.arc(pos.x,pos.y,50,0,Math.PI*2);
            ctx.fillStyle = category.color+'10';
            ctx.fill();
            ctx.fillStyle = category.color;
            ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(category.name,pos.x,pos.y-60);
            const total = bubbles.filter(b=>b.transaction.category===catId).reduce((s,b)=>s+b.transaction.amount,0);
            ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle='#94a3b8';
            ctx.fillText(`${total.toLocaleString()}`,pos.x,pos.y-40);
        }
    });
    bubbles.forEach((bubble,i)=>{
        bubble.update();
        if(bubblePhysics){ for(let j=i+1;j<bubbles.length;j++){ bubble.checkCollision(bubbles[j]); } }
        ctx.save();
        if(bubble.hovered||bubble.selected){ ctx.shadowBlur=20; ctx.shadowColor=bubble.color; }
        const gradient=ctx.createRadialGradient(bubble.x-bubble.radius*0.3,bubble.y-bubble.radius*0.3,0,bubble.x,bubble.y,bubble.radius);
        const op1=Math.floor(bubble.opacity*255).toString(16).padStart(2,'0');
        const op2=Math.floor(bubble.opacity*153).toString(16).padStart(2,'0');
        gradient.addColorStop(0,bubble.color+op1);
        gradient.addColorStop(1,bubble.color+op2);
        ctx.beginPath();
        ctx.arc(bubble.x,bubble.y,bubble.radius,0,Math.PI*2);
        ctx.fillStyle=gradient;
        ctx.fill();
        if(bubble.transaction.recurring){
            ctx.strokeStyle='#ffffff'+Math.floor(bubble.opacity*204).toString(16);
            ctx.lineWidth=2;
            ctx.setLineDash([5,5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
        if(bubble.radius>20&&bubble.opacity>0.5){
            ctx.fillStyle='#ffffff'+Math.floor(bubble.opacity*255).toString(16);
            ctx.font=`${Math.min(bubble.radius/3,14)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.textAlign='center';
            ctx.textBaseline='middle';
            ctx.fillText(`${bubble.transaction.amount}`,bubble.x,bubble.y);
        }
    });
    bubbles=bubbles.filter(b=>b.radius>0.1);
    if(selectedBubble){
        const bubble=bubbles.find(b=>b.transaction.id===selectedBubble);
        if(bubble){
            const boxW=200, boxH=80, boxX=bubble.x-boxW/2, boxY=bubble.y-bubble.radius-boxH-20;
            ctx.fillStyle='rgba(20, 20, 20, 0.95)';
            ctx.strokeStyle=bubble.color;
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.roundRect(boxX,boxY,boxW,boxH,8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle='#ffffff';
            ctx.font='bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign='left';
            ctx.fillText(bubble.transaction.name,boxX+10,boxY+20);
            ctx.font='12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle='#94a3b8';
            ctx.fillText(bubble.transaction.date.toLocaleDateString(),boxX+10,boxY+40);
            ctx.font='bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle=bubble.color;
            ctx.fillText(`${bubble.transaction.amount}`,boxX+10,boxY+60);
            if(bubble.transaction.recurring){
                ctx.font='11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.fillStyle='#60a5fa';
                ctx.fillText('Recurring',boxX+boxW-60,boxY+60);
            }
        }
    }
}
function drawNode(x,y,radius,label,amount,color='#ffffff'){
    const gradient=ctx.createRadialGradient(x,y,0,x,y,radius*2);
    gradient.addColorStop(0,color+'40');
    gradient.addColorStop(1,'transparent');
    ctx.fillStyle=gradient;
    ctx.fillRect(x-radius*2,y-radius*2,radius*4,radius*4);
    ctx.beginPath();
    ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
    ctx.strokeStyle=color+'80';
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.fillStyle='#ffffff';
    ctx.font='14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign='center';
    ctx.fillText(label,x,y-radius-10);
    ctx.font='bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`$${amount.toLocaleString()}`,x,y+5);
}
function drawFlow(flow){
    const source=incomeSources.find(s=>s.id===flow.from);
    const target=expenseCategories.find(t=>t.id===flow.to);
    if(!source||!target)return;
    const startX=width*0.15+offset.x;
    const startY=height*source.y+offset.y;
    const endX=width*0.85+offset.x;
    const endY=height*target.y+offset.y;
    ctx.beginPath();
    ctx.moveTo(startX,startY);
    const cp1X=startX+(endX-startX)*0.3;
    const cp1Y=startY;
    const cp2X=startX+(endX-startX)*0.7;
    const cp2Y=endY;
    ctx.bezierCurveTo(cp1X,cp1Y,cp2X,cp2Y,endX,endY);
    const flowWidth=Math.max(2,Math.abs(flow.amount)/100);
    ctx.lineWidth=flowWidth;
    ctx.strokeStyle=flow.extra ? '#fbbf24' : target.color+'30';
    ctx.stroke();
}
function drawBudgetWheel(){
    const centerX=width/2, centerY=height/2;
    const outerRadius=Math.min(width,height)*0.35;
    const innerRadius=outerRadius*0.4;
    if(wheelAnimation<1) wheelAnimation+=0.02;
    const totalBudget=budgetCategories.reduce((sum,cat)=>sum+cat.amount,0);
    let currentAngle=-Math.PI/2;
    budgetCategories.forEach(category=>{
        const percentage=category.amount/totalBudget;
        const angleSpan=percentage*Math.PI*2*wheelAnimation;
        const endAngle=currentAngle+angleSpan;
        if(!segmentAnimations[category.id]) segmentAnimations[category.id]={scale:1,targetScale:1};
        const anim=segmentAnimations[category.id];
        anim.scale+=(anim.targetScale-anim.scale)*0.1;
        let offsetX=0, offsetY=0;
        if(explodedCategory===category.id){
            const midAngle=currentAngle+angleSpan/2;
            offsetX=Math.cos(midAngle)*30*anim.scale;
            offsetY=Math.sin(midAngle)*30*anim.scale;
        }
        ctx.save();
        ctx.translate(centerX+offsetX,centerY+offsetY);
        if(explodedCategory===category.id){ ctx.shadowBlur=20; ctx.shadowColor=category.color; }
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.arc(0,0,outerRadius*anim.scale,currentAngle,endAngle);
        ctx.closePath();
        const gradient=ctx.createRadialGradient(0,0,innerRadius,0,0,outerRadius);
        gradient.addColorStop(0,category.color+'80');
        gradient.addColorStop(1,category.color);
        ctx.fillStyle=gradient;
        ctx.fill();
        ctx.globalCompositeOperation='destination-out';
        ctx.beginPath();
        ctx.arc(0,0,innerRadius,0,Math.PI*2);
        ctx.fill();
        ctx.globalCompositeOperation='source-over';
        if(explodedCategory===category.id && anim.scale>1.2){
            let subAngle=currentAngle;
            category.subcategories.forEach(sub=>{
                const subPct=sub.amount/category.amount;
                const subSpan=subPct*angleSpan;
                ctx.beginPath();
                ctx.moveTo(0,0);
                ctx.arc(0,0,innerRadius*0.9,subAngle,subAngle+subSpan);
                ctx.closePath();
                ctx.fillStyle=category.color+'40';
                ctx.fill();
                ctx.strokeStyle=category.color+'60';
                ctx.lineWidth=1;
                ctx.stroke();
                subAngle+=subSpan;
            });
        }
        const midAngle=currentAngle+angleSpan/2;
        const labelRadius=(outerRadius+innerRadius)/2;
        const labelX=Math.cos(midAngle)*labelRadius;
        const labelY=Math.sin(midAngle)*labelRadius;
        ctx.restore();
        ctx.save();
        ctx.translate(centerX+offsetX+labelX,centerY+offsetY+labelY);
        ctx.rotate(midAngle+Math.PI/2);
        ctx.fillStyle='#ffffff';
        ctx.font='bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign='center';
        ctx.fillText(category.name,0,0);
        ctx.font='12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`$${category.amount.toLocaleString()}`,0,18);
        ctx.fillText(`${(percentage*100).toFixed(1)}%`,0,35);
        ctx.restore();
        currentAngle=endAngle;
    });
    ctx.beginPath();
    ctx.arc(centerX,centerY,innerRadius*0.8,0,Math.PI*2);
    const centerGradient=ctx.createRadialGradient(centerX,centerY,0,centerX,centerY,innerRadius*0.8);
    centerGradient.addColorStop(0,'#1e293b');
    centerGradient.addColorStop(1,'#0f172a');
    ctx.fillStyle=centerGradient;
    ctx.fill();
    ctx.fillStyle='#e2e8f0';
    ctx.font='16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Monthly Budget',centerX,centerY-10);
    ctx.font='bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`$${totalBudget.toLocaleString()}`,centerX,centerY+15);
    if(baby2Mode){
        ctx.font='14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle='#fbbf24';
        ctx.fillText('With Baby #2',centerX,centerY+40);
    }
}
function getProjectedCashFlow(yearOffset,monthOffset){
    const totalMonths=yearOffset*12+monthOffset;
    let baseIncome=8500;
    let baseExpenses=6800;
    let netWorth=20000;
    lifeEvents.forEach(event=>{
        const eventMonths=event.year*12+event.month;
        if(eventMonths<=totalMonths){
            if(event.oneTimeCost) netWorth-=event.oneTimeCost;
            if(event.monthlyCost) baseExpenses+=event.monthlyCost;
        }
    });
    const monthlyNet=baseIncome-baseExpenses;
    netWorth+=monthlyNet*totalMonths;
    const years=totalMonths/12;
    const growth=Math.pow(1.07,years);
    netWorth*=growth;
    return { income: baseIncome, expenses: baseExpenses, netMonthly: monthlyNet, netWorth: netWorth, health: monthlyNet/baseIncome };
}
function drawTimelineRiver(){
    const riverY=height*0.5;
    const pixelsPerMonth=50*timelineZoom;
    const monthsVisible=Math.floor(width/pixelsPerMonth);
    riverAnimation+=0.02;
    waveOffset+=0.01;
    ctx.strokeStyle='#1e293b';
    ctx.lineWidth=1;
    ctx.fillStyle='#64748b';
    ctx.font='12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    for(let i=0;i<monthsVisible+2;i++){
        const x=i*pixelsPerMonth+timelineOffset.x%pixelsPerMonth;
        const monthIndex=Math.floor(-timelineOffset.x/pixelsPerMonth)+i;
        const year=Math.floor(monthIndex/12);
        const month=monthIndex%12;
        if(month===0){
            ctx.strokeStyle='#334155';
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(x,height*0.1);
            ctx.lineTo(x,height*0.9);
            ctx.stroke();
            ctx.fillStyle='#e2e8f0';
            ctx.font='bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign='center';
            ctx.fillText(`Year ${year}`,x,height*0.08);
        } else {
            ctx.strokeStyle='#1e293b';
            ctx.lineWidth=1;
            ctx.beginPath();
            ctx.moveTo(x,height*0.15);
            ctx.lineTo(x,height*0.85);
            ctx.stroke();
        }
    }
    ctx.beginPath();
    ctx.moveTo(0,riverY);
    for(let x=0;x<width;x+=5){
        const monthOffset=(x-timelineOffset.x)/pixelsPerMonth;
        const cashFlow=getProjectedCashFlow(Math.floor(monthOffset/12),Math.floor(monthOffset%12));
        const riverWidth=100+cashFlow.health*200;
        const wave=Math.sin((x+waveOffset*100)*0.02)*10;
        ctx.lineTo(x,riverY-riverWidth/2+wave);
    }
    for(let x=width;x>=0;x-=5){
        const monthOffset=(x-timelineOffset.x)/pixelsPerMonth;
        const cashFlow=getProjectedCashFlow(Math.floor(monthOffset/12),Math.floor(monthOffset%12));
        const riverWidth=100+cashFlow.health*200;
        const wave=Math.sin((x+waveOffset*100)*0.02)*10;
        ctx.lineTo(x,riverY+riverWidth/2-wave);
    }
    ctx.closePath();
    const gradient=ctx.createLinearGradient(0,riverY-150,0,riverY+150);
    gradient.addColorStop(0,'#10b98140');
    gradient.addColorStop(0.5,'#3b82f680');
    gradient.addColorStop(1,'#10b98140');
    ctx.fillStyle=gradient;
    ctx.fill();
    for(let i=0;i<20;i++){
        const particleX=(riverAnimation*width+i*100)%(width+100)-50;
        const particleY=riverY+Math.sin((particleX+i*50)*0.02)*30;
        const size=3+Math.sin(riverAnimation+i)*2;
        ctx.beginPath();
        ctx.arc(particleX,particleY,size,0,Math.PI*2);
        ctx.fillStyle='#60a5fa40';
        ctx.fill();
    }
    lifeEvents.forEach(event=>{
        const eventX=(event.year*12+event.month)*pixelsPerMonth+timelineOffset.x;
        if(eventX>-100 && eventX<width+100){
            const eventY=riverY;
            const isSelected=selectedEvent===event.id;
            const scale=isSelected?1.2:1;
            ctx.strokeStyle=eventTypes[event.type].color+'80';
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(eventX,eventY);
            ctx.lineTo(eventX,eventY-80*scale);
            ctx.stroke();
            ctx.save();
            ctx.translate(eventX,eventY-80*scale);
            if(isSelected){ ctx.shadowBlur=20; ctx.shadowColor=eventTypes[event.type].color; }
            ctx.beginPath();
            ctx.arc(0,0,25*scale,0,Math.PI*2);
            const nodeGradient=ctx.createRadialGradient(0,0,0,0,0,25*scale);
            nodeGradient.addColorStop(0,eventTypes[event.type].color);
            nodeGradient.addColorStop(1,eventTypes[event.type].color+'80');
            ctx.fillStyle=nodeGradient;
            ctx.fill();
            ctx.font=`${20*scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.textAlign='center';
            ctx.textBaseline='middle';
            ctx.fillText(eventTypes[event.type].icon,0,0);
            ctx.restore();
            ctx.fillStyle='#e2e8f0';
            ctx.font=`${12*scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.textAlign='center';
            ctx.fillText(event.name,eventX,eventY-110*scale);
            if(event.oneTimeCost||event.monthlyCost){
                ctx.font='11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                let costY=eventY-125*scale;
                if(event.oneTimeCost){
                    ctx.fillStyle=event.oneTimeCost>0?'#f87171':'#4ade80';
                    ctx.fillText(`$${Math.abs(event.oneTimeCost).toLocaleString()}`,eventX,costY);
                    costY-=15;
                }
                if(event.monthlyCost){
                    ctx.fillStyle=event.monthlyCost>0?'#f87171':'#4ade80';
                    ctx.fillText(`${event.monthlyCost>0?'+':''}$${Math.abs(event.monthlyCost)}/mo`,eventX,costY);
                }
            }
            const cashFlow=getProjectedCashFlow(event.year,event.month);
            if(cashFlow.netMonthly<0){
                ctx.strokeStyle='#dc2626';
                ctx.lineWidth=3;
                ctx.setLineDash([5,5]);
                ctx.beginPath();
                ctx.moveTo(eventX-30,riverY-150);
                ctx.lineTo(eventX+30,riverY-150);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle='#dc2626';
                ctx.font='bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.fillText('⚠️ Negative Flow',eventX,riverY-165);
            }
        }
    });
    const currentX=timelineOffset.x;
    if(currentX>-50 && currentX<width+50){
        ctx.strokeStyle='#4ade80';
        ctx.lineWidth=3;
        ctx.beginPath();
        ctx.moveTo(currentX,height*0.1);
        ctx.lineTo(currentX,height*0.9);
        ctx.stroke();
        ctx.fillStyle='#4ade80';
        ctx.font='bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign='center';
        ctx.fillText('NOW',currentX,height*0.05);
    }
}
function drawFlowView(){
    const bgGradient=ctx.createLinearGradient(0,0,width,0);
    bgGradient.addColorStop(0,'#0a0a0a');
    bgGradient.addColorStop(0.5,'#0f0f0f');
    bgGradient.addColorStop(1,'#0a0a0a');
    ctx.fillStyle=bgGradient;
    ctx.fillRect(0,0,width,height);
    const activeFlows=baby2Mode?[...flows,...baby2Flows]:flows;
    activeFlows.forEach(flow=>drawFlow(flow));
    if(!animationPaused){
        particles.forEach(p=>{
            p.update();
            const pos=p.getPosition();
            if(pos){
                ctx.beginPath();
                ctx.arc(pos.x,pos.y,p.size,0,Math.PI*2);
                const target=expenseCategories.find(t=>t.id===p.flow.to);
                const opacity=Math.floor(p.opacity*255).toString(16).padStart(2,'0');
                ctx.fillStyle=target?target.color+opacity:'#ffffff';
                ctx.fill();
            }
        });
    }
    ctx.save();
    ctx.shadowBlur=20;
    ctx.shadowColor='#4ade80';
    incomeSources.forEach(source=>{
        const x=width*0.15+offset.x;
        const y=height*source.y+offset.y;
        drawNode(x,y,35,source.name,source.amount,'#4ade80');
    });
    ctx.restore();
    ctx.save();
    ctx.shadowBlur=15;
    expenseCategories.forEach(category=>{
        if(category.id==='baby2fund' && !baby2Mode && !category.visible) return;
        ctx.shadowColor=category.color;
        const x=width*0.85+offset.x;
        const y=height*category.y+offset.y;
        const amount=baby2Mode && category.id==='childcare'?category.amount+1000:category.amount;
        drawNode(x,y,30,category.name,amount,category.color);
    });
    ctx.restore();
}
function draw(){
    ctx.clearRect(0,0,width,height);
    if(currentView==='transactions'){
        ctx.fillStyle='#0a0a0a';
        ctx.fillRect(0,0,width,height);
    } else if(currentView==='flow'){
        drawFlowView();
    } else if(currentView==='budget'){
        ctx.fillStyle='#0a0a0a';
        ctx.fillRect(0,0,width,height);
        drawBudgetWheel();
    } else if(currentView==='timeline'){
        const bgGradient=ctx.createLinearGradient(0,0,0,height);
        bgGradient.addColorStop(0,'#0a0a0a');
        bgGradient.addColorStop(0.5,'#0f172a');
        bgGradient.addColorStop(1,'#0a0a0a');
        ctx.fillStyle=bgGradient;
        ctx.fillRect(0,0,width,height);
        drawTimelineRiver();
    } else if(currentView==='bubbles'){
        ctx.fillStyle='#0a0a0a';
        ctx.fillRect(0,0,width,height);
        drawBubbleCloud();
    }
    requestAnimationFrame(draw);
}
function handleMouseMove(e){
    const rect=canvas.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const y=e.clientY-rect.top;
    if(currentView==='flow'){
        if(isDragging){ offset.x+=x-dragStart.x; offset.y+=y-dragStart.y; dragStart.x=x; dragStart.y=y; return; }
        let hovered=null;
        incomeSources.forEach(source=>{
            const nodeX=width*0.15+offset.x;
            const nodeY=height*source.y+offset.y;
            const dist=Math.sqrt((x-nodeX)**2+(y-nodeY)**2);
            if(dist<35) hovered=source;
        });
        expenseCategories.forEach(category=>{
            const nodeX=width*0.85+offset.x;
            const nodeY=height*category.y+offset.y;
            const dist=Math.sqrt((x-nodeX)**2+(y-nodeY)**2);
            if(dist<30) hovered=category;
        });
        if(hovered){
            canvas.style.cursor='pointer';
            tooltip.innerHTML=`<strong>${hovered.name}</strong><br>$${hovered.amount.toLocaleString()}/month`;
            tooltip.style.left=e.clientX+10+'px';
            tooltip.style.top=e.clientY-30+'px';
            tooltip.classList.add('visible');
        } else {
            canvas.style.cursor=isDragging?'grabbing':'grab';
            tooltip.classList.remove('visible');
        }
    } else if(currentView==='budget'){
        const centerX=width/2;
        const centerY=height/2;
        const dx=x-centerX;
        const dy=y-centerY;
        const distance=Math.sqrt(dx*dx+dy*dy);
        const angle=Math.atan2(dy,dx);
        const normalizedAngle=angle<-Math.PI/2?angle+Math.PI*2:angle;
        const outerRadius=Math.min(width,height)*0.35;
        const innerRadius=outerRadius*0.4;
        if(distance>innerRadius && distance<outerRadius){
            let currentAngle=-Math.PI/2;
            const totalBudget=budgetCategories.reduce((s,c)=>s+c.amount,0);
            for(const category of budgetCategories){
                const percentage=category.amount/totalBudget;
                const angleSpan=percentage*Math.PI*2;
                const endAngle=currentAngle+angleSpan;
                if(normalizedAngle>=currentAngle && normalizedAngle<endAngle){
                    canvas.style.cursor='pointer';
                    let tooltipContent=`<strong>${category.name}</strong><br>$${category.amount.toLocaleString()}/month<br>${(percentage*100).toFixed(1)}% of budget`;
                    tooltipContent+=explodedCategory===category.id?'<br><br><em>Click to collapse</em>':'<br><br><em>Click to see details</em>';
                    tooltip.innerHTML=tooltipContent;
                    tooltip.style.left=e.clientX+10+'px';
                    tooltip.style.top=e.clientY-30+'px';
                    tooltip.classList.add('visible');
                    if(segmentAnimations[category.id]) segmentAnimations[category.id].targetScale=1.05;
                    hoveredNode=category; break;
                }
                currentAngle=endAngle;
            }
        } else {
            canvas.style.cursor='default';
            tooltip.classList.remove('visible');
            Object.keys(segmentAnimations).forEach(id=>{ if(id!==explodedCategory) segmentAnimations[id].targetScale=1; });
            hoveredNode=null;
        }
    } else if(currentView==='timeline'){
        if(draggingEvent){
            const event=lifeEvents.find(e=>e.id===draggingEvent);
            if(event && !event.locked){
                const monthOffset=(x-timelineOffset.x)/(50*timelineZoom);
                event.year=Math.max(0,Math.floor(monthOffset/12));
                event.month=Math.max(0,Math.floor(monthOffset%12));
            }
            return;
        }
        if(isDragging){ timelineOffset.x+=x-dragStart.x; dragStart.x=x; return; }
        let hovered=null;
        lifeEvents.forEach(event=>{
            const eventX=(event.year*12+event.month)*50*timelineZoom+timelineOffset.x;
            const eventY=height*0.5-80;
            const dist=Math.sqrt((x-eventX)**2+(y-eventY)**2);
            if(dist<30) hovered=event;
        });
        if(hovered){
            canvas.style.cursor=hovered.locked?'not-allowed':'pointer';
            let tooltipContent=`<strong>${hovered.name}</strong><br>Year ${hovered.year}, Month ${hovered.month}`;
            if(hovered.oneTimeCost) tooltipContent+=`<br>One-time: $${Math.abs(hovered.oneTimeCost).toLocaleString()}`;
            if(hovered.monthlyCost) tooltipContent+=`<br>Monthly: ${hovered.monthlyCost>0?'+':''}$${Math.abs(hovered.monthlyCost)}`;
            if(!hovered.locked) tooltipContent+='<br><br><em>Click to edit, drag to move</em>';
            tooltip.innerHTML=tooltipContent;
            tooltip.style.left=e.clientX+10+'px';
            tooltip.style.top=e.clientY-30+'px';
            tooltip.classList.add('visible');
        } else {
            canvas.style.cursor=isDragging?'grabbing':'grab';
            tooltip.classList.remove('visible');
        }
        hoveredNode=hovered;
    } else if(currentView==='bubbles'){
        mouseAttractor={x,y};
        let hovered=null;
        bubbles.forEach(b=>{ b.hovered=false; if(b.contains(x,y)){ b.hovered=true; hovered=b; } });
        if(hovered){
            canvas.style.cursor='pointer';
            tooltip.innerHTML=`<strong>${hovered.transaction.name}</strong><br>${hovered.transaction.amount}<br>${hovered.transaction.date.toLocaleDateString()}`;
            tooltip.style.left=e.clientX+10+'px';
            tooltip.style.top=e.clientY-30+'px';
            tooltip.classList.add('visible');
        } else {
            canvas.style.cursor='default';
            tooltip.classList.remove('visible');
        }
    }
}
function handleMouseDown(e){
    const rect=canvas.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const y=e.clientY-rect.top;
    if(currentView==='flow'){
        isDragging=true; dragStart.x=x; dragStart.y=y;
    } else if(currentView==='budget' && hoveredNode){
        if(explodedCategory===hoveredNode.id){ explodedCategory=null; segmentAnimations[hoveredNode.id].targetScale=1; }
        else { if(explodedCategory) segmentAnimations[explodedCategory].targetScale=1; explodedCategory=hoveredNode.id; segmentAnimations[hoveredNode.id].targetScale=1.3; }
    } else if(currentView==='timeline'){
        if(hoveredNode && !hoveredNode.locked){
            selectedEvent=hoveredNode.id;
            draggingEvent=hoveredNode.id;
            document.querySelector('.event-editor').classList.add('visible');
            document.getElementById('eventName').value=hoveredNode.name;
            document.getElementById('eventCost').value=hoveredNode.oneTimeCost||'';
            document.getElementById('eventMonthly').value=hoveredNode.monthlyCost||'';
        } else {
            isDragging=true; dragStart.x=x;
        }
    } else if(currentView==='bubbles'){
        bubbles.forEach(bubble=>{
            if(bubble.contains(x,y)){
                if(selectedBubble===bubble.transaction.id){ bubble.pop(); selectedBubble=null; }
                else { selectedBubble=bubble.transaction.id; }
            }
        });
    }
}
function handleMouseUp(){ isDragging=false; draggingEvent=null; }
function toggleAnimation(){
    animationPaused=!animationPaused;
    document.getElementById('animToggle').textContent=animationPaused?'Resume Flow':'Pause Flow';
}
function toggleBaby2Mode(){
    baby2Mode=!baby2Mode;
    document.getElementById('baby2Toggle').classList.toggle('active');
    if(baby2Mode){
        budgetCategories.find(c=>c.id==='children').amount=2200;
        budgetCategories.find(c=>c.id==='children').subcategories[0].amount=1600;
        budgetCategories.find(c=>c.id==='savings').amount=500;
        budgetCategories.find(c=>c.id==='savings').subcategories[0].amount=200;
    } else {
        budgetCategories.find(c=>c.id==='children').amount=1200;
        budgetCategories.find(c=>c.id==='children').subcategories[0].amount=800;
        budgetCategories.find(c=>c.id==='savings').amount=1500;
        budgetCategories.find(c=>c.id==='savings').subcategories[0].amount=700;
    }
    createParticles();
    const totalExpenses=baby2Mode?7800:6800;
    const netSavings=baby2Mode?700:1700;
    const childExpenses=baby2Mode?2200:1200;
    document.querySelector('.info-panel .stat-row:nth-child(2) .stat-value').textContent=`$${totalExpenses.toLocaleString()}`;
    document.querySelector('.info-panel .stat-row:nth-child(3) .stat-value').textContent=`$${netSavings.toLocaleString()}`;
    document.querySelector('.info-panel .stat-row:nth-child(3) .stat-value').className=netSavings>1000?'stat-value positive':'stat-value';
    document.querySelector('.info-panel .stat-row:nth-child(4) .stat-value').textContent=`$${childExpenses.toLocaleString()}`;
}
function resetView(){
    offset.x=0; offset.y=0; timelineOffset.x=0; timelineZoom=1; wheelAnimation=0; explodedCategory=null;
    Object.keys(segmentAnimations).forEach(id=>{ segmentAnimations[id]={scale:1,targetScale:1}; });
}
function setView(view, evt){
    currentView=view;
    document.querySelectorAll('.view-tab').forEach(tab=>{ tab.classList.remove('active'); });
    if(evt) evt.target.classList.add('active');
    if(view==='timeline'){
        const currentFlow=getProjectedCashFlow(0,0);
        const futureFlow=getProjectedCashFlow(5,0);
        document.querySelector('.info-panel').innerHTML=`
            <h2>Timeline Projection</h2>
            <div class="stat-row"><span class="stat-label">Current Net Worth</span><span class="stat-value positive">$${Math.round(currentFlow.netWorth).toLocaleString()}</span></div>
            <div class="stat-row"><span class="stat-label">5-Year Projection</span><span class="stat-value positive">$${Math.round(futureFlow.netWorth).toLocaleString()}</span></div>
            <div class="stat-row"><span class="stat-label">Monthly Cash Flow</span><span class="stat-value ${currentFlow.netMonthly>0?'positive':'negative'}">$${Math.round(currentFlow.netMonthly).toLocaleString()}</span></div>
            <div class="stat-row" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);"><span class="stat-label">Next Event</span><span class="stat-value">Baby #2</span></div>
            <div class="stat-row"><span class="stat-label">Impact</span><span class="stat-value warning">-$1,000/mo</span></div>`;
    } else if(view==='bubbles'){
        const visibleTotal=bubbles.reduce((s,b)=>s+b.transaction.amount,0);
        const recurringTotal=bubbles.filter(b=>b.transaction.recurring).reduce((s,b)=>s+b.transaction.amount,0);
        document.querySelector('.info-panel').innerHTML=`
            <h2>Expense Bubbles</h2>
            <div class="stat-row"><span class="stat-label">View</span><span class="stat-value">${bubbleView==='month'?'This Month':bubbleView==='week'?'This Week':'All'}</span></div>
            <div class="stat-row"><span class="stat-label">Total Shown</span><span class="stat-value negative">${Math.round(visibleTotal).toLocaleString()}</span></div>
            <div class="stat-row"><span class="stat-label">Recurring</span><span class="stat-value">${Math.round(recurringTotal).toLocaleString()}</span></div>
            <div class="stat-row" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);"><span class="stat-label">Transactions</span><span class="stat-value">${bubbles.length}</span></div>
            <div class="stat-row"><span class="stat-label">Avg Transaction</span><span class="stat-value">${Math.round(visibleTotal/bubbles.length||0)}</span></div>`;
    } else {
        document.querySelector('.info-panel h2').textContent=view==='flow'?'Monthly Cash Flow':'Budget Breakdown';
    }
    document.querySelector('.timeline-controls').classList.toggle('visible',view==='timeline');
    document.querySelector('.bubble-controls').classList.toggle('visible',view==='bubbles');
    document.querySelector('.transaction-panel').classList.toggle('visible',view==='transactions');
    document.querySelector('.import-export-controls').style.display=view==='transactions'?'flex':'none';
    document.querySelector('.event-editor').classList.remove('visible');
    document.querySelector('.info-panel').style.display=view==='transactions'?'none':'block';
    document.querySelector('.document-panel').classList.toggle('visible',view==='documents');
    if(view==='budget'){ wheelAnimation=0; explodedCategory=null; Object.keys(segmentAnimations).forEach(id=>{ segmentAnimations[id]={scale:1,targetScale:1}; }); }
    else if(view==='timeline'){ riverAnimation=0; selectedEvent=null; }
    else if(view==='bubbles'){ createBubbles(); selectedBubble=null; }
    else if(view==='transactions'){ renderTransactionTable(); }
    else if(view==='documents'){ updateDocumentList(); }
}
function adjustZoom(delta){ timelineZoom=Math.max(0.5,Math.min(3,timelineZoom+delta)); }
function addLifeEvent(){
    const newEvent={ id:Date.now(), name:'New Event', year:2, month:0, type:'milestone', oneTimeCost:0, monthlyCost:0 };
    lifeEvents.push(newEvent); selectedEvent=newEvent.id;
    document.querySelector('.event-editor').classList.add('visible');
    document.getElementById('eventName').value=newEvent.name;
    document.getElementById('eventCost').value='';
    document.getElementById('eventMonthly').value='';
}
function saveEvent(){
    if(selectedEvent){
        const event=lifeEvents.find(e=>e.id===selectedEvent);
        if(event){
            event.name=document.getElementById('eventName').value;
            event.oneTimeCost=parseInt(document.getElementById('eventCost').value)||0;
            event.monthlyCost=parseInt(document.getElementById('eventMonthly').value)||0;
        }
    }
    document.querySelector('.event-editor').classList.remove('visible');
}
function deleteEvent(){
    if(selectedEvent){
        lifeEvents=lifeEvents.filter(e=>e.id!==selectedEvent);
        selectedEvent=null;
    }
    document.querySelector('.event-editor').classList.remove('visible');
}
function setBubbleView(view, evt){
    bubbleView=view;
    createBubbles();
    document.querySelectorAll('.bubble-filter').forEach(btn=>{ if(btn.textContent.includes('Month')||btn.textContent.includes('Week')||btn.textContent.includes('All')) btn.classList.remove('active'); });
    if(evt) evt.target.classList.add('active');
    setView('bubbles');
}
function togglePhysics(evt){
    bubblePhysics=!bubblePhysics;
    if(evt) evt.target.textContent=`Physics: ${bubblePhysics?'ON':'OFF'}`;
    if(!bubblePhysics){
        const cols=Math.ceil(Math.sqrt(bubbles.length));
        const cellW=width/cols;
        const cellH=height/cols;
        bubbles.forEach((bubble,i)=>{
            const col=i%cols;
            const row=Math.floor(i/cols);
            bubble.x=cellW*(col+0.5);
            bubble.y=cellH*(row+0.5);
            bubble.vx=0; bubble.vy=0;
        });
    }
}
function saveTransactions(){
    try {
        localStorage.setItem('familyFinanceTransactions', JSON.stringify(transactions));
    } catch (err) {
        console.warn('Could not save transactions to localStorage', err);
    }
}
function updateTransactionSummary(){
    const now=new Date();
    const currentMonth=now.getMonth();
    const currentYear=now.getFullYear();
    const monthTransactions=transactions.filter(t=> t.date.getMonth()===currentMonth && t.date.getFullYear()===currentYear );
    const income=monthTransactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expenses=monthTransactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    document.getElementById('incomeTotal').textContent=`${income.toLocaleString()}`;
    document.getElementById('expenseTotal').textContent=`${expenses.toLocaleString()}`;
    document.getElementById('netTotal').textContent=`${(income-expenses).toLocaleString()}`;
    document.getElementById('netTotal').className=income-expenses>=0?'value positive':'value negative';
    document.getElementById('transactionCount').textContent=monthTransactions.length;
}
function renderTransactionTable(){
    const tbody=document.getElementById('transactionTableBody');
    if(!tbody) return;
    tbody.innerHTML='';
    const sorted=[...transactions].sort((a,b)=>b.date-a.date);
    sorted.forEach(transaction=>{
        const row=document.createElement('tr');
        const category=budgetCategories.find(c=>c.id===transaction.category)||{name:transaction.category,color:'#64748b'};
        row.innerHTML=`
            <td>${transaction.date.toLocaleDateString()}</td>
            <td>${transaction.name}${transaction.recurring?'<span class="recurring-badge">Recurring</span>':''}</td>
            <td><span class="category-badge" style="background: ${category.color}20; color: ${category.color}">${category.name}</span></td>
            <td class="${transaction.type==='income'?'positive':'negative'}">${transaction.amount.toLocaleString()}</td>
            <td>${transaction.type}</td>
            <td class="transaction-actions"><button class="btn-small" onclick="editTransaction(${transaction.id})">Edit</button><button class="btn-small btn-danger" onclick="deleteTransaction(${transaction.id})">Delete</button></td>`;
        tbody.appendChild(row);
    });
    updateTransactionSummary();
}
function addTransaction(){
    const name=document.getElementById('transName').value;
    const amount=parseFloat(document.getElementById('transAmount').value);
    const date=new Date(document.getElementById('transDate').value);
    const category=document.getElementById('transCategory').value;
    const type=document.getElementById('transType').value;
    const recurring=document.getElementById('transRecurring').checked;
    if(!name||!amount||isNaN(amount)){ alert('Please fill in all required fields'); return; }
    const transaction={ id:Date.now(), name, amount, category:type==='income'?'income':category, type, date, recurring };
    transactions.push(transaction);
    saveTransactions();
    renderTransactionTable();
    updateBudgetFromTransactions();
    document.getElementById('transName').value='';
    document.getElementById('transAmount').value='';
    document.getElementById('transRecurring').checked=false;
    if(currentView==='bubbles') createBubbles();
}
function editTransaction(id){
    const transaction=transactions.find(t=>t.id===id);
    if(!transaction) return;
    document.getElementById('transName').value=transaction.name;
    document.getElementById('transAmount').value=transaction.amount;
    document.getElementById('transDate').value=transaction.date.toISOString().split('T')[0];
    document.getElementById('transCategory').value=transaction.category;
    document.getElementById('transType').value=transaction.type;
    document.getElementById('transRecurring').checked=transaction.recurring;
    deleteTransaction(id,false);
    document.querySelector('.transaction-form').scrollIntoView({behavior:'smooth'});
}
function deleteTransaction(id,confirm=true){
    if(confirm && !window.confirm('Are you sure you want to delete this transaction?')) return;
    transactions=transactions.filter(t=>t.id!==id);
    saveTransactions();
    renderTransactionTable();
    updateBudgetFromTransactions();
    if(currentView==='bubbles') createBubbles();
}
function updateBudgetFromTransactions(){
    const incomeTx=transactions.filter(t=>t.type==='income'&&t.recurring);
    const now=new Date();
    const monthlyIncome=transactions.filter(t=> t.type==='income' && t.date.getMonth()===now.getMonth() && t.date.getFullYear()===now.getFullYear() );
    if(monthlyIncome.length>0){
        const totalIncome=monthlyIncome.reduce((s,t)=>s+t.amount,0);
        const incomeStat=document.querySelector('.info-panel .stat-row:first-child .stat-value');
        if(incomeStat) incomeStat.textContent=`${totalIncome.toLocaleString()}`;
    }
    const monthExpenses=transactions.filter(t=> t.type==='expense' && t.date.getMonth()===now.getMonth() && t.date.getFullYear()===now.getFullYear() );
    budgetCategories.forEach(cat=>{ cat.amount=0; });
    monthExpenses.forEach(exp=>{ const category=budgetCategories.find(c=>c.id===exp.category); if(category){ category.amount+=exp.amount; } });
    expenseCategories.forEach(expCat=>{ const budgetCat=budgetCategories.find(c=>c.id===expCat.id); if(budgetCat) expCat.amount=budgetCat.amount; });
    updateFlows();
}
function updateFlows(){
    const totalIncome=incomeSources.reduce((s,sr)=>s+sr.amount,0);
    const totalExpenses=expenseCategories.reduce((s,c)=>s+c.amount,0);
    flows=[];
    incomeSources.forEach(source=>{
        expenseCategories.forEach(expense=>{
            if(expense.amount>0){
                const prop=expense.amount/totalExpenses;
                const flowAmount=Math.round(source.amount*prop);
                if(flowAmount>0){ flows.push({ from:source.id, to:expense.id, amount:flowAmount }); }
            }
        });
    });
}
function importTransactions(){
    const input=document.createElement('input');
    input.type='file';
    input.accept='.csv';
    input.onchange=e=>{
        const file=e.target.files[0];
        const reader=new FileReader();
        reader.onload=event=>{
            const csv=event.target.result;
            const lines=csv.split('\n');
            const headers=lines[0].split(',');
            for(let i=1;i<lines.length;i++){
                const values=lines[i].split(',');
                if(values.length>=5){
                    transactions.push({ id:Date.now()+i, date:new Date(values[0]), name:values[1].replace(/"/g,''), amount:parseFloat(values[2]), category:values[3].replace(/"/g,''), type:values[4].replace(/"/g,'').trim(), recurring:values[5]==='true' });
                }
            }
            saveTransactions();
            renderTransactionTable();
            updateBudgetFromTransactions();
        };
        reader.readAsText(file);
    };
    input.click();
}
function exportTransactions(){
    let csv='Date,Description,Amount,Category,Type,Recurring\n';
    transactions.forEach(t=>{ csv+=`${t.date.toISOString().split('T')[0]},"${t.name}",${t.amount},"${t.category}","${t.type}",${t.recurring}\n`; });
    const blob=new Blob([csv],{type:'text/csv'});
    const url=window.URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='transactions.csv'; a.click();
}
// Document Tracker
const docDefinitions=[
  {id:'passport',name:'Passport Copy',category:'Identity',why:'Proof of identity for all filings',requirements:{}},
  {id:'visa',name:'Visa Page',category:'Identity',why:'Shows legal entry status',requirements:{}},
  {id:'resPermit',name:'Residence Permit',category:'Identity',why:'Required for long stay',requirements:{}},
  {id:'entryExit',name:'Entry/Exit Record',category:'Identity',why:'Track days in China for 183-day and six-year rules',requirements:{options:['sixYear']}},
  {id:'workPermit',name:'Work Permit',category:'Employment',why:'Authorization to work',requirements:{employment:['chinese','dual']}},
  {id:'contract',name:'Employment Contract',category:'Employment',why:'Proof of employment terms',requirements:{}},
  {id:'payslips',name:'Monthly Pay Slips',category:'Employment',why:'Evidence of salary received',requirements:{}},
  {id:'taxCert',name:'Annual Tax Withholding Certificate',category:'Employment',why:'Required for tax filings or PR',requirements:{}},
  {id:'siRegistration',name:'Social Insurance Registration',category:'Employment',why:'Shows enrollment in social insurance',requirements:{}},
  {id:'marriageCert',name:'Marriage Certificate',category:'Family',why:'Needed for PR applications',requirements:{options:['applyPR']}},
  {id:'birthCert',name:'Child Birth Certificate',category:'Family',why:'Supports childcare or education deduction',requirements:{deductions:['childcare','educationDed']}},
  {id:'childPassport',name:'Child Passport',category:'Family',why:'ID for dependent visas and benefits',requirements:{deductions:['childcare','educationDed']}},
  {id:'bankStmt',name:'Bank Statements',category:'Financial',why:'Proof of income deposits',requirements:{options:['applyPR']}},
  {id:'siRecord',name:'Social Insurance Payment Record',category:'Financial',why:'Needed for PR or benefits',requirements:{options:['applyPR']}},
  {id:'taxReturn',name:'Annual Tax Settlement Receipt',category:'Financial',why:'Proof of tax compliance',requirements:{options:['applyPR']}},
  {id:'lease',name:'Lease Contract',category:'Housing',why:'Evidence of rental',requirements:{housing:['renting']}},
  {id:'housingFapiao',name:'Housing Rent Fapiao',category:'Housing',why:'Needed for allowance or deduction',requirements:{housing:['renting'],allowances:['housing'],deductions:['rent']}},
  {id:'housingAllowance',name:'Housing Allowance Statement',category:'Housing',why:'Records employer-provided housing benefit',requirements:{allowances:['housing']}},
  {id:'propertyCert',name:'Property Ownership Certificate',category:'Housing',why:'Proof of owning home',requirements:{housing:['own']}},
  {id:'mortgageReceipt',name:'Mortgage Interest Receipt',category:'Housing',why:'Support mortgage deduction',requirements:{housing:['own']}},
  {id:'housingFund',name:'Housing Provident Fund Statement',category:'Financial',why:'Shows contributions',requirements:{options:['applyPR']}},
  {id:'homeLeave',name:'Home Leave Tickets',category:'Travel',why:'Receipts for travel reimbursement',requirements:{allowances:['homeLeave']}},
  {id:'childcareRec',name:'Childcare Receipts',category:'Deductions',why:'Prove childcare expenses',requirements:{deductions:['childcare']}},
  {id:'eduFapiao',name:'Education Fee Fapiao',category:'Deductions',why:'Needed for education allowance or deduction',requirements:{allowances:['education'],deductions:['educationDed']}},
  {id:'langFapiao',name:'Language Training Fapiao',category:'Deductions',why:'Proof of language course reimbursement',requirements:{allowances:['language']}},
  {id:'donationRec',name:'Donation Receipt',category:'Deductions',why:'Supports charitable deduction',requirements:{deductions:['donation']}}
];
let documentStatus=JSON.parse(localStorage.getItem('docStatus')||'{}');
function saveDocStatus(){localStorage.setItem('docStatus',JSON.stringify(documentStatus));}
function getSelections(){
  const emp=document.getElementById('employmentType').value;
  const allowances=[...document.querySelectorAll('.allowance-option:checked')].map(c=>c.value);
  const deductions=[...document.querySelectorAll('.deduction-option:checked')].map(c=>c.value);
  const housing=document.getElementById('housingSituation').value;
  const options=[...document.querySelectorAll('.other-option:checked')].map(c=>c.value);
  return {emp,allowances,deductions,housing,options};
}
function isDocNeeded(doc,sel){
  if(doc.requirements.employment && !doc.requirements.employment.includes(sel.emp)) return false;
  if(doc.requirements.allowances && !doc.requirements.allowances.some(a=>sel.allowances.includes(a))) return false;
  if(doc.requirements.deductions && !doc.requirements.deductions.some(d=>sel.deductions.includes(d))) return false;
  if(doc.requirements.housing && !doc.requirements.housing.includes(sel.housing)) return false;
  if(doc.requirements.options && !doc.requirements.options.some(o=>sel.options.includes(o))) return false;
  return true;
}
function updateDocumentList(){
  const sel=getSelections();
  const list=document.getElementById('documentList');
  list.innerHTML='';
  const needed=docDefinitions.filter(d=>isDocNeeded(d,sel));
  const cats={};
  needed.forEach(d=>{if(!cats[d.category]) cats[d.category]=[]; cats[d.category].push(d);});
  Object.entries(cats).forEach(([cat,docs])=>{
    const catDiv=document.createElement('div');
    catDiv.className='doc-category';
    const done=docs.filter(d=>documentStatus[d.id]==='Complete').length;
    const catHeader=document.createElement('h4');
    catHeader.textContent=`${cat} (${done}/${docs.length})`;
    const bar=document.createElement('div');
    bar.className='progress-bar small';
    bar.style.setProperty('--progress',docs.length?Math.round(done/docs.length*100)+'%':'0%');
    catHeader.appendChild(bar);
    catDiv.appendChild(catHeader);
    docs.forEach(doc=>{
      const card=document.createElement('div');
      card.className='doc-card';
      card.dataset.status=documentStatus[doc.id]||'NotStarted';
      const name=document.createElement('span');
      name.textContent=doc.name;
      const tooltip=document.createElement('span');
      tooltip.textContent='?';
      tooltip.className='doc-tooltip';
      tooltip.title=doc.why;
      const select=document.createElement('select');
      select.className='doc-status';
      ['NotStarted','InProgress','Complete','NotApplicable'].forEach(s=>{
        const opt=document.createElement('option');
        opt.value=s; opt.textContent=s; select.appendChild(opt);
      });
      select.value=documentStatus[doc.id]||'NotStarted';
      select.onchange=()=>{documentStatus[doc.id]=select.value;saveDocStatus();updateProgress();updateDocumentList();};
      card.appendChild(name);
      card.appendChild(select);
      card.appendChild(tooltip);
      catDiv.appendChild(card);
    });
    list.appendChild(catDiv);
  });
  updateProgress();
  const warnings=[];
  if(sel.allowances.length>0) warnings.push('Fapiao required for selected allowances.');
  if(sel.options.includes('sixYear')) warnings.push('Keep entry/exit logs to manage six-year rule.');
  if(sel.options.includes('applyPR')) warnings.push('PR may lead to worldwide tax obligations.');
  document.getElementById('docWarnings').textContent=warnings.join(' ');
}
function updateProgress(){
  const sel=getSelections();
  const needed=docDefinitions.filter(d=>isDocNeeded(d,sel));
  const total=needed.length;
  const done=needed.filter(d=>documentStatus[d.id]==='Complete').length;
  const percent=total?Math.round((done/total)*100):0;
  const bar=document.getElementById('docProgress');
  if(bar){
    bar.style.setProperty('--progress',percent+'%');
  }
  const text=document.getElementById('docProgressText');
  if(text) text.textContent=percent+'%';
}
function initDocTracker(){
  document.querySelectorAll('.allowance-option,.deduction-option,#employmentType,#housingSituation,.other-option').forEach(el=>{
    el.addEventListener('change',updateDocumentList);
  });
  updateDocumentList();
}
window.addEventListener('resize',()=>{ resize(); createParticles(); if(currentView==='bubbles') createBubbles(); });
if(!ctx.roundRect){ CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){ this.beginPath(); this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.quadraticCurveTo(x+w,y,x+w,y+r); this.lineTo(x+w,y+h-r); this.quadraticCurveTo(x+w,y+h,x+w-r,y+h); this.lineTo(x+r,y+h); this.quadraticCurveTo(x,y+h,x,y+h-r); this.lineTo(x,y+r); this.quadraticCurveTo(x,y,x+r,y); this.closePath(); }; }
canvas.addEventListener('mousemove',handleMouseMove);
canvas.addEventListener('mousedown',handleMouseDown);
canvas.addEventListener('mouseup',handleMouseUp);
canvas.addEventListener('mouseleave',handleMouseUp);
canvas.addEventListener('wheel',e=>{ if(currentView==='timeline'){ e.preventDefault(); adjustZoom(-e.deltaY*0.001); } });
document.getElementById('transType').addEventListener('change',e=>{ const categorySelect=document.getElementById('transCategory'); const categoryGroup=categorySelect.parentElement; categoryGroup.style.display=e.target.value==='income'?'none':'flex'; });
resize();
createParticles();
renderTransactionTable();
updateBudgetFromTransactions();
initDocTracker();
setView('transactions');
draw();
