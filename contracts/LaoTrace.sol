// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LaoTraceWeb3 {
    // 1. กำหนดหมวดหมู่สินค้า (เกษตรกรรม vs หัตถกรรม)
    enum Category { AGRICULTURE, HANDICRAFT }

    // 2. โครงสร้างข้อมูลหลักของสินค้า (แทนตาราง Products ในฐานข้อมูล)
    struct Product {
        uint256 productId;
        Category category;
        string name;                // ชื่อสินค้า เช่น "Paksong Arabica" หรือ "Savannakhet Silk"
        string rootIpfsHash;        // CID ของไฟล์ JSON/รูปภาพต้นน้ำบน IPFS
        address producer;           // Wallet ของชาวสวน หรือ ช่างทอผ้า
        uint256 rawWeightKg;        // น้ำหนักผลผลิตสด (กก.) ใช้คำนวณโควตาเกษตร (ถ้าเป็นผ้าไหมใส่ 0)
        uint256 maxUnits;           // จำนวนถุงในล็อต (เกษตร) หรือ 1 ชิ้น (หัตถกรรม)
        bool isCertified;           // สถานะการรับรองมาตรฐาน Organic / GI
        string certIpfsHash;        // CID ของไฟล์ PDF ใบรับรองจากหน่วยงานรัฐ
        address certifiedBy;        // Wallet ของผู้ตรวจรับรอง
    }

    // 3. โครงสร้างประวัติแต่ละขั้นตอน (แทนตาราง Timeline Logs)
    struct Checkpoint {
        string stageName;           // เช่น "เก็บเกี่ยวสด", "คั่วระดับกลาง", "ทอมือและย้อมครามธรรมชาติ"
        string locationGPS;         // พิกัด GPS เช่น "15.1764, 106.2338"
        string evidenceIpfsHash;    // CID รูปภาพหลักฐานของขั้นตอนนี้บน IPFS
        address actor;              // Wallet ของผู้บันทึกขั้นตอนนี้
        uint256 timestamp;          // เวลาที่บันทึกบนบล็อกเชน (แก้ไขไม่ได้)
    }

    // 4. ตัวแปรเก็บข้อมูลบนบล็อกเชน (On-Chain State Storage)
    address public admin;
    uint256 public nextProductId = 1;

    mapping(address => bool) public authorizedProducers;   // สิทธิ์ชาวสวน / ช่างทอผ้า
    mapping(address => bool) public authorizedProcessors;  // สิทธิ์โรงแปรรูป / สหกรณ์
    mapping(address => bool) public authorizedCertifiers;  // สิทธิ์ผู้ตรวจมาตรฐาน GI / Organic

    mapping(uint256 => Product) public products;
    mapping(uint256 => Checkpoint[]) private productTimelines;
    
    // เก็บสถานะการสแกนยืนยันของแท้รายถุง/รายชิ้น: productId => (unitNumber => isClaimed)
    mapping(uint256 => mapping(uint256 => bool)) public isUnitClaimed;

    // 5. Events สำหรับให้ Frontend ดักจับสถานะการทำงาน
    event ProductRegistered(uint256 indexed productId, Category category, string name, address indexed producer, uint256 maxUnits);
    event CheckpointAdded(uint256 indexed productId, string stageName, address indexed actor, uint256 timestamp);
    event ProductCertified(uint256 indexed productId, address indexed certifier, string certIpfsHash);
    event UnitClaimed(uint256 indexed productId, uint256 unitNumber, address claimedBy, uint256 timestamp);

    constructor() {
        admin = msg.sender;
        // ให้สิทธิ์คน Deploy เป็นทั้ง Producer, Processor และ Certifier อัตโนมัติเพื่อความสะดวกตอนทดสอบ
        authorizedProducers[msg.sender] = true;
        authorizedProcessors[msg.sender] = true;
        authorizedCertifiers[msg.sender] = true;
    }

    // --- ฟังก์ชันจัดการสิทธิ์ (Role Management) ---
    function grantRoles(address _account, bool _isProducer, bool _isProcessor, bool _isCertifier) external {
        require(msg.sender == admin, "Only admin can grant roles");
        authorizedProducers[_account] = _isProducer;
        authorizedProcessors[_account] = _isProcessor;
        authorizedCertifiers[_account] = _isCertifier;
    }

    // --- ฟังก์ชันที่ 1: ลงทะเบียนสินค้าต้นน้ำ + ตรวจสอบโควตาบนเชน ---
    function registerProduct(
        Category _category,
        string memory _name,
        string memory _rootIpfsHash,
        string memory _initialGPS,
        uint256 _rawWeightKg,
        uint256 _requestedUnits
    ) external returns (uint256) {
        require(authorizedProducers[msg.sender], "Not an authorized producer");

        if (_category == Category.HANDICRAFT) {
            require(_requestedUnits == 1, "Handicraft must be a single unique item (maxUnits = 1)");
        } else {
            require(_rawWeightKg > 0 && _requestedUnits > 0, "Invalid agriculture weight or units");
            // กฎ Mass Balance บนเชน: กาแฟสด 1 กก. บรรจุถุงขายจริงได้ไม่เกิน 2 ถุง (ปรับสูตรตามจริงได้)
            require(_requestedUnits <= _rawWeightKg * 2, "Requested units exceed raw harvest weight quota!");
        }

        uint256 productId = nextProductId++;

        products[productId] = Product({
            productId: productId,
            category: _category,
            name: _name,
            rootIpfsHash: _rootIpfsHash,
            producer: msg.sender,
            rawWeightKg: _rawWeightKg,
            maxUnits: _requestedUnits,
            isCertified: false,
            certIpfsHash: "",
            certifiedBy: address(0)
        });

        // บันทึกจุดเริ่มต้นเข้า Timeline อัตโนมัติ
        productTimelines[productId].push(Checkpoint({
            stageName: _category == Category.AGRICULTURE ? "Harvested at Origin Farm" : "Handwoven by Artisan",
            locationGPS: _initialGPS,
            evidenceIpfsHash: _rootIpfsHash,
            actor: msg.sender,
            timestamp: block.timestamp
        }));

        emit ProductRegistered(productId, _category, _name, msg.sender, _requestedUnits);
        return productId;
    }

    // --- ฟังก์ชันที่ 2: เพิ่มขั้นตอนการแปรรูป / ขนส่ง ---
    function addCheckpoint(
        uint256 _productId,
        string memory _stageName,
        string memory _locationGPS,
        string memory _evidenceIpfsHash
    ) external {
        require(
            authorizedProducers[msg.sender] || authorizedProcessors[msg.sender],
            "Caller is not an authorized producer or processor"
        );
        require(products[_productId].productId != 0, "Product does not exist");

        productTimelines[_productId].push(Checkpoint({
            stageName: _stageName,
            locationGPS: _locationGPS,
            evidenceIpfsHash: _evidenceIpfsHash,
            actor: msg.sender,
            timestamp: block.timestamp
        }));

        emit CheckpointAdded(_productId, _stageName, msg.sender, block.timestamp);
    }

    // --- ฟังก์ชันที่ 3: ประทับตรารับรองมาตรฐาน GI / Organic ---
    function certifyProduct(
        uint256 _productId,
        string memory _certIpfsHash
    ) external {
        require(authorizedCertifiers[msg.sender], "Not an authorized certifier");
        require(products[_productId].productId != 0, "Product does not exist");

        products[_productId].isCertified = true;
        products[_productId].certIpfsHash = _certIpfsHash;
        products[_productId].certifiedBy = msg.sender;

        // เพิ่มเข้าใน Timeline ด้วยว่าผ่านการตรวจรับรองแล้ว
        productTimelines[_productId].push(Checkpoint({
            stageName: "Official Organic / GI Certified",
            locationGPS: "Department of Agriculture / Certifier Body",
            evidenceIpfsHash: _certIpfsHash,
            actor: msg.sender,
            timestamp: block.timestamp
        }));

        emit ProductCertified(_productId, msg.sender, _certIpfsHash);
    }

    // --- ฟังก์ชันที่ 4: ผู้ซื้อยืนยันความเป็นเจ้าของรายถุง/รายชิ้น (ป้องกันการก๊อปปี้ QR) ---
    function claimUnit(uint256 _productId, uint256 _unitNumber) external {
        require(products[_productId].productId != 0, "Product does not exist");
        require(_unitNumber > 0 && _unitNumber <= products[_productId].maxUnits, "Invalid unit serial number");
        require(!isUnitClaimed[_productId][_unitNumber], "WARNING: This unit has already been claimed!");

        isUnitClaimed[_productId][_unitNumber] = true;
        emit UnitClaimed(_productId, uint256(_unitNumber), msg.sender, block.timestamp);
    }

    // --- ฟังก์ชันที่ 5: ดึงข้อมูลทั้งหมดไปแสดงผลหน้าเว็บ (ฟรี ไม่เสียค่า Gas) ---
    function getProductDetails(uint256 _productId) external view returns (Product memory) {
        return products[_productId];
    }

    function getTimeline(uint256 _productId) external view returns (Checkpoint[] memory) {
        return productTimelines[_productId];
    }
}
